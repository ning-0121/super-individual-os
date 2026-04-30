import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json()

  // 1. Fetch existing review to find linked task_id
  const { data: existing, error: fetchErr } = await supabase
    .from('task_reviews')
    .select('task_id, review_status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !existing) return Response.json({ error: 'Review not found' }, { status: 404 })

  // 2. Update the review
  const { error: updateErr } = await supabase
    .from('task_reviews')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 400 })

  // 3. Auto-link review status → task workflow_status
  const newStatus = body.review_status as string | undefined
  if (newStatus && newStatus !== existing.review_status && existing.task_id) {
    const taskUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    switch (newStatus) {
      case 'approved':
        taskUpdates.workflow_status = 'completed'
        taskUpdates.completed_at    = new Date().toISOString()
        taskUpdates.status          = 'done'  // also update legacy kanban status
        break
      case 'revision_required':
        taskUpdates.workflow_status = 'revision_required'
        taskUpdates.status          = 'in_progress'
        break
      case 'rejected':
        taskUpdates.workflow_status = 'archived'
        taskUpdates.status          = 'paused'
        break
    }

    if (Object.keys(taskUpdates).length > 1) {
      await supabase.from('tasks').update(taskUpdates).eq('id', existing.task_id)
    }
  }

  return Response.json({ ok: true, task_id: existing.task_id })
}
