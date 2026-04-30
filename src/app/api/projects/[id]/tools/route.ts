import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { maskSecretFields } from '@/lib/crypto'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  const [{ data: integrations }, { data: grants }] = await Promise.all([
    supabase.from('tool_integrations')
      .select('id, tool_name, tool_type, auth_status, is_active, config')
      .eq('user_id', user.id),
    supabase.from('project_tool_grants')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', projectId),
  ])

  const grantsByIntId = new Map((grants ?? []).map(g => [g.tool_integration_id as string, g]))

  // Each integration row + its (optional) project grant + masked config
  const merged = (integrations ?? []).map(int => {
    const grant = grantsByIntId.get(int.id as string)
    return {
      tool_integration_id: int.id,
      tool_name: int.tool_name,
      tool_type: int.tool_type,
      auth_status: int.auth_status,
      is_active: int.is_active,
      config: maskSecretFields((int.config ?? {}) as Record<string, unknown>),
      grant: grant ? {
        is_enabled: grant.is_enabled,
        default_config_override: grant.default_config_override ?? {},
      } : null,                              // no grant = inherit user-level
    }
  })

  return Response.json(merged)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as {
    tool_integration_id: string
    is_enabled?: boolean
    default_config_override?: Record<string, unknown>
  }

  if (!body.tool_integration_id) return apiError('tool_integration_id required', { status: 400 })

  // Verify ownership
  const { data: int } = await supabase
    .from('tool_integrations').select('id').eq('id', body.tool_integration_id).eq('user_id', user.id).single()
  if (!int) return apiError('Integration not found', { status: 404 })

  const { error } = await supabase.from('project_tool_grants').upsert({
    user_id: user.id,
    project_id: projectId,
    tool_integration_id: body.tool_integration_id,
    is_enabled: body.is_enabled ?? true,
    default_config_override: body.default_config_override ?? {},
  }, { onConflict: 'project_id,tool_integration_id' })

  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
