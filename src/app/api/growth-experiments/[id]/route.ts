import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { error } = await supabase.from('growth_experiments')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('growth_experiments')
    .delete().eq('id', id).eq('user_id', user.id)
  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
