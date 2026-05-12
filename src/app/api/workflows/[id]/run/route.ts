import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { startWorkflowRun } from '@/services/workflow-runtime'
import { appendActivity } from '@/services/project-context'

// POST /api/workflows/[id]/run  → starts a new run
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const out = await startWorkflowRun(supabase, user.id, id)
  if (!out.ok) return apiError(out.error ?? 'failed', { status: 400 })

  // V2.9 — log run-start activity to project memory
  const { data: wf } = await supabase.from('workflows')
    .select('name, project_id').eq('id', id).maybeSingle()
  if (wf?.project_id) {
    await appendActivity(supabase, user.id, wf.project_id as string, {
      activity_type: 'workflow_update',
      title: `▶ Workflow started: ${wf.name ?? 'workflow'}`,
      metadata: { workflow_id: id, workflow_run_id: out.run_id },
    }).catch(() => {})
  }

  return Response.json({ ok: true, run_id: out.run_id })
}
