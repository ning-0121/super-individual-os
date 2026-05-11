import { createClient } from '@/lib/supabase/server'
import { appendActivity } from '@/services/project-context'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Capture pre-state for status-change detection
  const { data: before } = await supabase.from('tasks')
    .select('title, project_id, workflow_status').eq('id', id).eq('user_id', user.id).maybeSingle()

  const { error } = await supabase
    .from('tasks')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return new Response(error.message, { status: 400 })

  // V2.5+ — Activity hook (best-effort)
  if (before?.project_id) {
    const newStatus = body.workflow_status ?? body.status
    if (newStatus && newStatus !== before.workflow_status) {
      const completed = newStatus === 'completed' || newStatus === 'approved'
      await appendActivity(supabase, user.id, before.project_id as string, {
        activity_type: 'task_update',
        title: completed
          ? `完成: ${before.title}`
          : `${before.title}: ${before.workflow_status} → ${newStatus}`,
        summary: '',
        metadata: { task_id: id, from: before.workflow_status, to: newStatus, status: newStatus },
      }).catch(() => {})
    }
  }

  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', user.id)
  if (error) return new Response(error.message, { status: 400 })
  return Response.json({ ok: true })
}
