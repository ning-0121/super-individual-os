import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params

  // Fetch task_run + joined task + agent + reviews
  const { data: run, error } = await supabase
    .from('task_runs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !run) return Response.json({ error: 'Not found' }, { status: 404 })

  const [{ data: task }, { data: agent }, { data: reviews }] = await Promise.all([
    supabase.from('tasks').select('*').eq('id', run.task_id).single(),
    run.assigned_unit_id
      ? supabase.from('execution_units').select('*').eq('id', run.assigned_unit_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('task_reviews').select('*').eq('task_id', run.task_id).order('created_at', { ascending: false }),
  ])

  return Response.json({ run, task, agent, reviews: reviews ?? [] })
}
