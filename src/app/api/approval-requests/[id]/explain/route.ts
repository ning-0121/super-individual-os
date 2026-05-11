import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { generateExplanation, explanationToText } from '@/lib/approvals/explainer'
import { riskLevelToLabel, type RiskLabel } from '@/lib/approvals/risk'

// POST /api/approval-requests/[id]/explain
// Generates a rule-based explanation card and persists it on the row.
// Body: { persist?: boolean }   default true
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { persist?: boolean }
  const persist = body.persist !== false

  const { data: row } = await supabase
    .from('approval_requests')
    .select('id, action_type, action_payload, risk_level, risk_label, title, description, requested_by, classification_reason, project_id, task_id')
    .eq('id', id).eq('user_id', user.id).single()
  if (!row) return apiError('Approval request not found', { status: 404 })

  let projectName: string | null = null
  let taskTitle: string | null = null
  if (row.project_id) {
    const { data: p } = await supabase.from('projects').select('name').eq('id', row.project_id).maybeSingle()
    projectName = (p?.name as string) ?? null
  }
  if (row.task_id) {
    const { data: t } = await supabase.from('tasks').select('title').eq('id', row.task_id).maybeSingle()
    taskTitle = (t?.title as string) ?? null
  }

  const risk_label: RiskLabel = (row.risk_label as RiskLabel) ?? riskLevelToLabel(row.risk_level as number)

  const explanation = generateExplanation({
    action_type: row.action_type as string,
    risk_label,
    title: (row.title as string) || undefined,
    description: (row.description as string) || undefined,
    requested_by: (row.requested_by as string) || undefined,
    payload: row.action_payload as Record<string, unknown>,
    project_name: projectName,
    task_title: taskTitle,
    classification_reason: (row.classification_reason as string) || undefined,
  })

  const text = explanationToText(explanation)
  if (persist) {
    await supabase.from('approval_requests')
      .update({ explanation: text }).eq('id', id).eq('user_id', user.id)
  }

  return Response.json({ explanation, text })
}
