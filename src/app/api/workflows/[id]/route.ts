import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// GET /api/workflows/[id]
// Returns: { workflow, steps[], latest_run, step_runs[] }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params

  const [{ data: workflow }, { data: steps }] = await Promise.all([
    supabase.from('workflows').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('workflow_steps').select('*').eq('workflow_id', id).eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
  ])
  if (!workflow) return apiError('Workflow not found', { status: 404 })

  const { data: latestRun } = await supabase.from('workflow_runs')
    .select('*').eq('workflow_id', id).eq('user_id', user.id)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

  let step_runs: unknown[] = []
  if (latestRun?.id) {
    const { data: sr } = await supabase.from('workflow_step_runs')
      .select('*').eq('workflow_run_id', latestRun.id).eq('user_id', user.id)
      .order('created_at', { ascending: true })
    step_runs = sr ?? []
  }

  return Response.json({
    workflow,
    steps: steps ?? [],
    latest_run: latestRun ?? null,
    step_runs,
  })
}

// DELETE /api/workflows/[id] — archive (soft delete)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('workflows')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
