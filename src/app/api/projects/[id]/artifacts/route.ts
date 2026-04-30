import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const { data, error } = await supabase
    .from('artifacts').select('*')
    .eq('user_id', user.id).eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data ?? [])
}
