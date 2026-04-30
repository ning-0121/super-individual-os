import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const { data } = await supabase
    .from('conversations').select('*')
    .eq('user_id', user.id).eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as { mode: string; title?: string }
  if (!body.mode) return apiError('mode required', { status: 400 })

  const { data, error } = await supabase.from('conversations').insert({
    user_id: user.id,
    project_id: projectId,
    mode: body.mode,
    title: body.title ?? '(新对话)',
  }).select().single()

  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data, { status: 201 })
}
