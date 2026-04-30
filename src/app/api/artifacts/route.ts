import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId  = searchParams.get('projectId')
  const taskId     = searchParams.get('taskId')
  const taskRunId  = searchParams.get('taskRunId')

  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)
  if (taskId)    query = query.eq('task_id', taskId)
  if (taskRunId) query = query.eq('task_run_id', taskRunId)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 400 })
  return Response.json(data ?? [])
}
