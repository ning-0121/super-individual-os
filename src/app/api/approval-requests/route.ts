import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') ?? 'pending'
  const projectId  = searchParams.get('projectId')
  const taskId     = searchParams.get('taskId')
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  let query = supabase
    .from('approval_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)
  if (taskId)    query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data ?? [])
}
