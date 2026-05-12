import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { getTemplate, validateTemplate, type TemplateStep } from '@/lib/workflows/templates'
import { appendActivity } from '@/services/project-context'

// ─────────────────────────────────────────────────
// GET /api/projects/[id]/workflows
// Lists workflows for the project + latest run per workflow + step count.
// ─────────────────────────────────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { data: workflows } = await supabase.from('workflows')
    .select('id, name, description, status, created_at, metadata')
    .eq('user_id', user.id).eq('project_id', id)
    .order('created_at', { ascending: false })

  const wfIds = (workflows ?? []).map(w => w.id as string)
  if (wfIds.length === 0) return Response.json({ workflows: [] })

  // Batch: step counts
  const { data: stepRows } = await supabase.from('workflow_steps')
    .select('workflow_id').eq('user_id', user.id).in('workflow_id', wfIds)
  const stepCounts = new Map<string, number>()
  for (const s of (stepRows ?? [])) {
    const wid = s.workflow_id as string
    stepCounts.set(wid, (stepCounts.get(wid) ?? 0) + 1)
  }

  // Batch: latest run per workflow
  interface RunSlice {
    id: string; workflow_id: string; status: string
    started_at: string; finished_at: string | null
    bottleneck_step_key: string | null
    completed_step_keys: string[]; failed_step_keys: string[]; current_step_keys: string[]
  }
  const { data: runs } = await supabase.from('workflow_runs')
    .select('id, workflow_id, status, started_at, finished_at, bottleneck_step_key, completed_step_keys, failed_step_keys, current_step_keys')
    .eq('user_id', user.id).in('workflow_id', wfIds)
    .order('started_at', { ascending: false })
  const latestRunByWf = new Map<string, RunSlice>()
  for (const r of ((runs ?? []) as RunSlice[])) {
    if (!latestRunByWf.has(r.workflow_id)) latestRunByWf.set(r.workflow_id, r)
  }

  const enriched = (workflows ?? []).map(w => {
    const wid = w.id as string
    const latest = latestRunByWf.get(wid)
    return {
      ...w,
      step_count: stepCounts.get(wid) ?? 0,
      latest_run: latest
        ? {
            id: latest.id,
            status: latest.status,
            started_at: latest.started_at,
            finished_at: latest.finished_at,
            bottleneck_step_key: latest.bottleneck_step_key,
            completed: ((latest.completed_step_keys ?? []) as string[]).length,
            failed: ((latest.failed_step_keys ?? []) as string[]).length,
            current: ((latest.current_step_keys ?? []) as string[]).length,
          }
        : null,
    }
  })

  return Response.json({ workflows: enriched })
}

// ─────────────────────────────────────────────────
// POST /api/projects/[id]/workflows
// Body modes:
//   { template_id: string, name?: string }              → fork a template
//   { name: string, steps: TemplateStep[], description? } → custom
// ─────────────────────────────────────────────────
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json().catch(() => ({})) as {
    template_id?: string
    name?: string
    description?: string
    steps?: TemplateStep[]
  }

  // Resolve template path vs custom path
  let wfName: string
  let wfDescription: string
  let steps: TemplateStep[]
  let templateId: string | null = null

  if (body.template_id) {
    const tpl = getTemplate(body.template_id)
    if (!tpl) return apiError('template not found', { status: 404 })
    const v = validateTemplate(tpl)
    if (!v.ok) return apiError(`template invalid: ${v.issues.join('; ')}`, { status: 400 })
    wfName = body.name?.trim() || tpl.name
    wfDescription = body.description?.trim() || tpl.description
    steps = tpl.steps as TemplateStep[]
    templateId = tpl.id
  } else {
    if (!body.name?.trim()) return apiError('name required', { status: 400 })
    if (!Array.isArray(body.steps) || body.steps.length === 0)
      return apiError('steps required (≥1)', { status: 400 })

    // Validate custom DAG using the same validator
    const v = validateTemplate({
      id: 'custom', name: body.name, description: body.description ?? '',
      category: 'product', estimated_duration_minutes: 0, steps: body.steps,
    })
    if (!v.ok) return apiError(`custom workflow invalid: ${v.issues.join('; ')}`, { status: 400 })

    wfName = body.name.trim()
    wfDescription = body.description?.trim() ?? ''
    steps = body.steps
  }

  // Insert workflow
  const { data: workflow, error: wfErr } = await supabase.from('workflows').insert({
    user_id: user.id, project_id: projectId,
    name: wfName, description: wfDescription, status: 'active',
    metadata: { template_id: templateId, created_via: templateId ? 'template' : 'custom' },
  }).select().single()
  if (wfErr || !workflow) return apiError(wfErr?.message ?? 'workflow insert failed', { status: 400 })

  // Insert steps
  const stepRows = steps.map((s, idx) => ({
    user_id: user.id,
    workflow_id: workflow.id,
    step_key: s.step_key,
    name: s.name,
    description: s.description ?? '',
    step_type: s.step_type ?? 'task',
    depends_on: s.depends_on ?? [],
    manager_role: s.approval_role ?? null,
    max_attempts: s.max_attempts ?? 3,
    requires_approval: s.requires_approval ?? false,
    approval_role: s.approval_role ?? null,
    metadata: {
      required_capability: s.required_capability ?? null,
      suggested_execution_unit_type: s.suggested_execution_unit_type ?? null,
      estimated_minutes: s.estimated_minutes ?? null,
    },
    sort_order: idx * 10,
  }))
  const { error: stepErr } = await supabase.from('workflow_steps').insert(stepRows)
  if (stepErr) {
    await supabase.from('workflows').delete().eq('id', workflow.id)
    return apiError(`step insert failed: ${stepErr.message}`, { status: 400 })
  }

  // Audit + activity
  await audit(supabase, user.id, 'workflow.created' as never, {
    resource_type: 'workflow', resource_id: workflow.id,
    metadata: { project_id: projectId, name: wfName, template_id: templateId, step_count: steps.length },
  } as never)
  await appendActivity(supabase, user.id, projectId, {
    activity_type: 'workflow_update',
    title: `Workflow created: ${wfName}`,
    summary: templateId ? `From template ${templateId}` : 'Custom workflow',
    metadata: { workflow_id: workflow.id, step_count: steps.length, template_id: templateId },
  }).catch(() => {})

  return Response.json({ ok: true, workflow }, { status: 201 })
}
