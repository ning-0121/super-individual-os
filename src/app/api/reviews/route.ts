import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data } = await supabase
    .from('task_reviews')
    .select('*, tasks(title)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const reviews = (data ?? []).map(r => ({
    ...r,
    task_title: (r as { tasks?: { title?: string } }).tasks?.title ?? '未命名任务',
  }))

  return Response.json(reviews)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('task_reviews')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 400 })
  return Response.json(data, { status: 201 })
}
