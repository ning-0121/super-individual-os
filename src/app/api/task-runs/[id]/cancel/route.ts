import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params

  const { data: run } = await supabase
    .from('task_runs')
    .select('id, task_id, run_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 })

  if (!['queued', 'running'].includes(String(run.run_status))) {
    return Response.json({
      error: `当前状态 ${run.run_status} 无法取消`,
    }, { status: 400 })
  }

  await supabase.from('task_runs').update({
    run_status: 'cancelled',
    finished_at: new Date().toISOString(),
    error_message: '用户取消',
  }).eq('id', id)

  // Revert task to assigned (so user can re-run)
  await supabase.from('tasks').update({
    workflow_status: 'assigned',
    status: 'todo',
  }).eq('id', run.task_id)

  await audit(supabase, user.id, 'task_run.cancelled', {
    resource_type: 'task_run', resource_id: id,
    metadata: { task_id: run.task_id },
  })

  return Response.json({ ok: true })
}
