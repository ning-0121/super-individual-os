import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data } = await supabase
    .from('tool_integrations')
    .select('id, tool_name, tool_type, auth_status, allowed_agent_types, is_active, created_at, config')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  // Strip access_token before returning to client (security)
  const sanitized = (data ?? []).map(t => {
    const cfg = (t.config ?? {}) as Record<string, unknown>
    const safeConfig: Record<string, unknown> = {}
    for (const k of Object.keys(cfg)) {
      if (/token|secret|password|key/i.test(k)) {
        safeConfig[k] = cfg[k] ? '••••••••' : ''
      } else {
        safeConfig[k] = cfg[k]
      }
    }
    return { ...t, config: safeConfig }
  })

  return Response.json(sanitized)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { tool_name, tool_type = 'api', config = {}, allowed_agent_types = [] } = body

  if (!tool_name) return Response.json({ error: 'tool_name required' }, { status: 400 })

  // Upsert by (user_id, tool_name)
  const { data: existing } = await supabase
    .from('tool_integrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('tool_name', tool_name)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('tool_integrations')
      .update({ tool_type, config, allowed_agent_types, auth_status: 'connected', is_active: true })
      .eq('id', existing.id)
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ id: existing.id, ok: true, action: 'updated' })
  }

  const { data, error } = await supabase
    .from('tool_integrations')
    .insert({ user_id: user.id, tool_name, tool_type, config, allowed_agent_types, auth_status: 'connected', is_active: true })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
