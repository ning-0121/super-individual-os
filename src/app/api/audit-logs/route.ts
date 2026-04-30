import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  const { searchParams } = new URL(req.url)
  const eventType    = searchParams.get('event_type')
  const resourceId   = searchParams.get('resource_id')
  const resourceType = searchParams.get('resource_type')
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (eventType)    query = query.eq('event_type', eventType)
  if (resourceId)   query = query.eq('resource_id', resourceId)
  if (resourceType) query = query.eq('resource_type', resourceType)

  const { data, error } = await query
  if (error) return apiError(error.message, { status: 400, code: 'db_error' })
  return Response.json(data ?? [])
}
