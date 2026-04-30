import { createClient } from '@/lib/supabase/server'
import { executeTaskRun } from '@/lib/ai/run-task'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: parentRunId } = await params

  // Load parent run
  const { data: parent } = await supabase
    .from('task_runs')
    .select('id, task_id, retry_count, max_retries, run_status')
    .eq('id', parentRunId)
    .eq('user_id', user.id)
    .single()

  if (!parent) return Response.json({ error: 'Run not found' }, { status: 404 })

  // Only failed runs can be retried
  if (parent.run_status !== 'failed') {
    return Response.json({
      error: `只能重试失败的运行（当前状态：${parent.run_status}）`,
    }, { status: 400 })
  }

  const nextRetryCount = (parent.retry_count ?? 0) + 1
  const maxRetries     = parent.max_retries ?? 3
  if (nextRetryCount > maxRetries) {
    return Response.json({
      error: `已达最大重试次数（${maxRetries}）`,
      retry_count: parent.retry_count,
    }, { status: 429 })
  }

  const outcome = await executeTaskRun({
    supabase, userId: user.id,
    taskId: parent.task_id as string,
    parentRunId: parent.id as string,
    retryCount: nextRetryCount,
  })

  if ('error' in outcome) {
    const e = outcome.error
    return Response.json({ error: e.kind, detail: e }, { status: 409 })
  }
  if ('runtime_error' in outcome) {
    return Response.json({
      ok: false,
      task_run_id: outcome.task_run_id,
      error: outcome.runtime_error,
    }, { status: 500 })
  }

  return Response.json({ ...outcome, retry_count: nextRetryCount })
}
