import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params

  // Verify conversation ownership
  const { data: conv } = await supabase
    .from('conversations').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!conv) return apiError('Conversation not found', { status: 404 })

  const { data } = await supabase
    .from('messages').select('*').eq('conversation_id', id)
    .order('created_at', { ascending: true })

  return Response.json(data ?? [])
}
