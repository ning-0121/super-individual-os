import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { classifyActionRisk, riskLabelToLevel, type RiskLabel } from '@/lib/approvals/risk'

/**
 * GET /api/approval-requests?status=pending&projectId=...&enrich=true
 *
 * When `enrich=true` (default), each row is augmented with project_name and
 * task_title — used by the /approvals UI.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') ?? 'pending'
  const projectId  = searchParams.get('projectId')
  const taskId     = searchParams.get('taskId')
  const enrich     = searchParams.get('enrich') !== 'false'
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  let query = supabase
    .from('approval_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)
  if (taskId)    query = query.eq('task_id', taskId)

  const { data: rows, error } = await query
  if (error) return apiError(error.message, { status: 400 })

  const requests = rows ?? []
  if (!enrich || requests.length === 0) return Response.json(requests)

  const projectIds = [...new Set(requests.map(r => r.project_id as string).filter(Boolean))]
  const taskIds    = [...new Set(requests.map(r => r.task_id as string).filter(Boolean))]

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    taskIds.length
      ? supabase.from('tasks').select('id, title, task_type').in('id', taskIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; task_type: string }> }),
  ])

  const projectMap = new Map((projects ?? []).map(p => [p.id as string, p.name as string]))
  const taskMap    = new Map((tasks ?? []).map(t => [t.id as string, { title: t.title as string, task_type: t.task_type as string }]))

  const enriched = requests.map(r => ({
    ...r,
    project_name: r.project_id ? (projectMap.get(r.project_id as string) ?? '(unknown)') : null,
    task_title: r.task_id ? (taskMap.get(r.task_id as string)?.title ?? '(deleted)') : null,
    task_type: r.task_id ? (taskMap.get(r.task_id as string)?.task_type ?? '') : null,
  }))

  return Response.json(enriched)
}

// ─────────────────────────────────────────────────
// POST — create a manual / test approval request
// Body: {
//   title, description?, action_type,
//   risk_label?, risk_level?, payload?,
//   requested_by?, related_project_id?, related_task_id?
// }
// If risk_label is omitted, it's auto-classified from action_type.
// ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    title?: string
    description?: string
    action_type?: string
    risk_label?: RiskLabel
    risk_level?: number
    payload?: Record<string, unknown>
    requested_by?: string
    related_project_id?: string | null
    related_task_id?: string | null
  }

  if (!body.action_type) return apiError('action_type required', { status: 400 })
  if (!body.related_project_id) {
    return apiError('related_project_id required (FK NOT NULL on approval_requests.project_id)', { status: 400 })
  }

  // Risk classification
  const classified = classifyActionRisk(body.action_type)
  const risk_label: RiskLabel = body.risk_label ?? classified.label
  const risk_level: number = body.risk_level ?? riskLabelToLevel(risk_label)

  const { data, error } = await supabase.from('approval_requests').insert({
    user_id: user.id,
    project_id: body.related_project_id,
    task_id:    body.related_task_id ?? null,
    action_type: body.action_type,
    action_payload: body.payload ?? {},
    title: body.title ?? body.action_type,
    description: body.description ?? '',
    risk_level,
    risk_label,
    requested_by: body.requested_by ?? 'system',
    required_approvers: ['ceo'],
    classification_reason: classified.reason,
    status: 'pending',
  }).select().single()

  if (error || !data) return apiError(error?.message ?? 'insert failed', { status: 400 })

  await audit(supabase, user.id, 'approval.created' as never, {
    resource_type: 'approval_request', resource_id: data.id,
    metadata: { action_type: body.action_type, risk_label, requested_by: body.requested_by },
  } as never)

  return Response.json(data, { status: 201 })
}
