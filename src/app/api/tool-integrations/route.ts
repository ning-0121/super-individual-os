import { createClient } from '@/lib/supabase/server'
import { encryptSecretFields, maskSecretFields, assertProductionSafeKey } from '@/lib/crypto'
import { apiError, apiOk, logger } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const { data } = await supabase
      .from('tool_integrations')
      .select('id, tool_name, tool_type, auth_status, allowed_agent_types, is_active, created_at, config')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    const sanitized = (data ?? []).map(t => ({
      ...t,
      config: maskSecretFields((t.config ?? {}) as Record<string, unknown>),
    }))
    return Response.json(sanitized)
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/tool-integrations', method: 'GET' })
    return apiError('Failed to load integrations', { status: 500 })
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  // V1.6: production env guard
  try {
    assertProductionSafeKey()
  } catch (e) {
    const err = e as Error & { code?: string; status?: number }
    return apiError(err.message, { status: err.status ?? 503, code: err.code ?? 'encryption_key_missing' })
  }

  try {
    const body = await req.json()
    const { tool_name, tool_type = 'api', config = {}, allowed_agent_types = [] } = body
    if (!tool_name) return apiError('tool_name required', { status: 400, code: 'missing_field' })

    const { data: existing } = await supabase
      .from('tool_integrations')
      .select('id, config')
      .eq('user_id', user.id)
      .eq('tool_name', tool_name)
      .maybeSingle()

    let merged: Record<string, unknown> = config
    if (existing) {
      const existingCfg = (existing.config ?? {}) as Record<string, unknown>
      merged = { ...existingCfg }
      for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
        if (typeof v === 'string' && v.startsWith('••')) continue   // keep existing on masked
        merged[k] = v
      }
    }

    const encryptedConfig = encryptSecretFields(merged)

    if (existing) {
      const { error } = await supabase
        .from('tool_integrations')
        .update({ tool_type, config: encryptedConfig, allowed_agent_types, auth_status: 'connected', is_active: true })
        .eq('id', existing.id)
      if (error) return apiError(error.message, { status: 400, code: 'db_error' })
      logger.info('tool_integration.updated', { user_id: user.id, tool: tool_name })
      await audit(supabase, user.id, 'tool_integration.update', {
        resource_type: 'tool_integration', resource_id: existing.id,
        metadata: { tool_name },
      })
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
    await audit(supabase, user.id, 'tool_integration.create', {
      resource_type: 'tool_integration', resource_id: data.id,
      metadata: { tool_name },
    })
    return Response.json(data, { status: 201 })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/tool-integrations', method: 'POST' })
    return apiError('Failed to save integration', { status: 500 })
  }
}
