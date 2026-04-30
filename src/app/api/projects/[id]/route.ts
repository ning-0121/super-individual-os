import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', id).eq('user_id', user.id).single()
  if (error || !data) return apiError('Project not found', { status: 404 })

  return Response.json(data)
}
