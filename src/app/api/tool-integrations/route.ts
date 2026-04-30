import { createClient } from '@/lib/supabase/server'
import { encryptSecretFields, maskSecretFields } from '@/lib/crypto'
import { apiError, apiOk, logger } from '@/lib/observability'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  const { data } = await supabase
    .from('tool_integrations')
    .select('id, tool_name, tool_type, auth_status, allowed_agent_types, is_active, created_at, config')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  // Mask all secret fields before returning to client
  const sanitized = (data ?? []).map(t => ({
    ...t,
    config: maskSecretFields((t.config ?? {}) as Record<string, unknown>),
  }))

  return Response.json(sanitized)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  const body = await req.json()
  const { tool_name, tool_type = 'api', config = {}, allowed_agent_types = [] } = body
  if (!tool_name) return apiError('tool_name required', { status: 400, code: 'missing_field' })

  // Find existing
  const { data: existing } = await supabase
    .from('tool_integrations')
    .select('id, config')
    .eq('user_id', user.id)
    .eq('tool_name', tool_name)
    .maybeSingle()

  // For UPDATE: any field where user submitted "••••••••" should keep the existing encrypted value
  let merged: Record<string, unknown> = config
  if (existing) {
    const existingCfg = (existing.config ?? {}) as Record<string, unknown>
    merged = { ...existingCfg }
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
      if (typeof v === 'string' && v.startsWith('••')) {
        // keep existing
        continue
      }
      merged[k] = v
    }
  }

  // Encrypt secret fields (idempotent: already-encrypted values pass through)
  const encryptedConfig = encryptSecretFields(merged)

  if (existing) {
    const { error } = await supabase
      .from('tool_integrations')
      .update({ tool_type, config: encryptedConfig, allowed_agent_types, auth_status: 'connected', is_active: true })
      .eq('id', existing.id)
    if (error) return apiError(error.message, { status: 400, code: 'db_error' })
    logger.info('tool_integration.updated', { user_id: user.id, tool: tool_name })
    return apiOk({ id: existing.id, action: 'updated' })
  }

  const { data, error } = await supabase
    .from('tool_integrations')
    .insert({
      user_id: user.id, tool_name, tool_type,
      config: encryptedConfig, allowed_agent_types,
      auth_status: 'connected', is_active: true,
    })
    .select()
    .single()

  if (error) return apiError(error.message, { status: 400, code: 'db_error' })
  logger.info('tool_integration.created', { user_id: user.id, tool: tool_name })
  return Response.json(data, { status: 201 })
}
