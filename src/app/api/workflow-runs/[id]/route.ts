import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// GET /api/workflow-runs/[id] → run + step_runs
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const [{ data: run }, { data: stepRuns }] = await Promise.all([
    supabase.from('workflow_runs').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('workflow_step_runs').select('*')
      .eq('workflow_run_id', id).eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ])
  if (!run) return apiError('Run not found', { status: 404 })

  return Response.json({ run, step_runs: stepRuns ?? [] })
}
