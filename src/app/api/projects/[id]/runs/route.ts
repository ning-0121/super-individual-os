import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  // Get task IDs in this project, then runs joined to those tasks
  const { data: tasks } = await supabase
    .from('tasks').select('id, title')
    .eq('user_id', user.id).eq('project_id', projectId)

  const taskIds = (tasks ?? []).map(t => t.id as string)
  if (taskIds.length === 0) return Response.json([])

  const titleById = new Map((tasks ?? []).map(t => [t.id as string, t.title as string]))

  const { data: runs } = await supabase
    .from('task_runs')
    .select('id, task_id, assigned_unit_id, run_status, retry_count, started_at, finished_at, error_message, output_payload')
    .eq('user_id', user.id)
    .in('task_id', taskIds)
    .order('started_at', { ascending: false })
    .limit(100)

  const enriched = (runs ?? []).map(r => {
    const out = (r.output_payload ?? {}) as { summary?: string; total_steps?: number; evaluation?: { verdict: string; score: number } | null }
    return {
      id: r.id,
      task_id: r.task_id,
      task_title: titleById.get(r.task_id as string) ?? '(deleted)',
      assigned_unit_id: r.assigned_unit_id,
      run_status: r.run_status,
      retry_count: r.retry_count ?? 0,
      started_at: r.started_at,
      finished_at: r.finished_at,
      summary: out.summary ?? '',
      total_steps: out.total_steps ?? 0,
      evaluation: out.evaluation ?? null,
      error_message: ((r.error_message as string) ?? '').slice(0, 200),
    }
  })

  return Response.json(enriched)
}
