import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

const DEFAULTS = {
  mood: 'neutral', expression: 'neutral', action: 'idle',
  outfit: 'default', growth_stage: 'youth',
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const { data } = await supabase
    .from('avatar_states')
    .select('*')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .maybeSingle()

  if (!data) {
    return Response.json({
      user_id: user.id, project_id: projectId,
      ...DEFAULTS, metadata: {},
      _virtual: true,                       // not yet persisted
    })
  }
  return Response.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as Partial<typeof DEFAULTS> & { metadata?: Record<string, unknown> }

  const upsert = {
    user_id: user.id,
    project_id: projectId,
    mood:         body.mood ?? DEFAULTS.mood,
    expression:   body.expression ?? DEFAULTS.expression,
    action:       body.action ?? DEFAULTS.action,
    outfit:       body.outfit ?? DEFAULTS.outfit,
    growth_stage: body.growth_stage ?? DEFAULTS.growth_stage,
    metadata:     body.metadata ?? {},
    updated_at:   new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('avatar_states')
    .upsert(upsert, { onConflict: 'user_id,project_id' })
    .select().single()

  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data)
}
