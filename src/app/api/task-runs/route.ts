import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')

  let query = supabase.from('task_runs').select('*').eq('user_id', user.id).order('started_at', { ascending: false })
  if (taskId) query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 400 })
  return Response.json(data ?? [])
}
