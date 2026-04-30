import { createClient } from '@/lib/supabase/server'
import { executeTaskRun } from '@/lib/ai/run-task'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: taskId } = await params

  const outcome = await executeTaskRun({
    supabase, userId: user.id, taskId,
  })

  if ('error' in outcome) {
    const e = outcome.error
    switch (e.kind) {
      case 'task_not_found':       return Response.json({ error: 'Task not found' }, { status: 404 })
      case 'agent_not_found':      return Response.json({ error: 'Agent not found' }, { status: 404 })
      case 'no_agent':             return Response.json({ error: '该任务未分配 Agent，请先指派' }, { status: 400 })
      case 'agent_human':          return Response.json({ error: '人工任务需手动执行' }, { status: 400 })
      case 'agent_inactive':       return Response.json({ error: 'Agent 已禁用' }, { status: 400 })
      case 'concurrent_run':       return Response.json({
        error: `该任务已有正在运行的执行（${e.status}），请等待完成或取消`,
        existing_run_id: e.existing_run_id,
      }, { status: 409 })
      case 'dependencies_unmet':   return Response.json({
        error: '前置任务未完成，无法运行',
        blocked_by: e.blocked_by,
      }, { status: 409 })
      case 'retry_limit_reached':  return Response.json({
        error: `已达最大重试次数（${e.max_retries}）`,
        retry_count: e.retry_count,
      }, { status: 429 })
    }
  }

  if ('runtime_error' in outcome) {
    return Response.json({
      ok: false,
      task_run_id: outcome.task_run_id,
      error: outcome.runtime_error,
    }, { status: 500 })
  }

  return Response.json(outcome)
}
