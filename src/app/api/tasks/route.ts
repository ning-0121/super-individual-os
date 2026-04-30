import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  let query = supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return new Response(error.message, { status: 400 })
  return Response.json(data ?? [])
}
