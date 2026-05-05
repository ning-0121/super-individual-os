import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const systemId = searchParams.get('systemId')
  const status   = searchParams.get('status')

  let query = supabase.from('growth_experiments').select('*')
    .eq('user_id', user.id).order('updated_at', { ascending: false })
  if (systemId) query = query.eq('system_id', systemId)
  if (status)   query = query.eq('status', status)

  const { data, error } = await query
  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json() as {
    system_id: string; project_id?: string;
    name: string; hypothesis?: string; channel?: string;
    target_metric?: string; baseline_value?: string; target_value?: string;
  }

  if (!body.system_id || !body.name) {
    return apiError('system_id + name required', { status: 400 })
  }

  const { data, error } = await supabase.from('growth_experiments').insert({
    user_id: user.id,
    system_id: body.system_id,
    project_id: body.project_id ?? null,
    name: body.name,
    hypothesis: body.hypothesis ?? '',
    channel: body.channel ?? '',
    target_metric: body.target_metric ?? '',
    baseline_value: body.baseline_value ?? '',
    target_value: body.target_value ?? '',
    status: 'planning',
  }).select().single()

  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data, { status: 201 })
}
