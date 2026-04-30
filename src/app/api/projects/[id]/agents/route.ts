import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { resolveProjectAgents } from '@/lib/projects/scope'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const resolved = await resolveProjectAgents(supabase, user.id, projectId)
  return Response.json(resolved)
}

// Upsert: enable/disable + override per agent
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as {
    execution_unit_id: string
    is_enabled?: boolean
    system_prompt_override?: string
    tools_allowed_override?: string[] | null
    settings?: Record<string, unknown>
  }

  if (!body.execution_unit_id) return apiError('execution_unit_id required', { status: 400 })

  // Verify ownership
  const { data: unit } = await supabase
    .from('execution_units').select('id').eq('id', body.execution_unit_id).eq('user_id', user.id).single()
  if (!unit) return apiError('Agent not found', { status: 404 })

  const { error } = await supabase.from('project_agents').upsert({
    user_id: user.id,
    project_id: projectId,
    execution_unit_id: body.execution_unit_id,
    is_enabled: body.is_enabled ?? true,
    system_prompt_override: body.system_prompt_override ?? '',
    tools_allowed_override: body.tools_allowed_override ?? null,
    settings: body.settings ?? {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,execution_unit_id' })

  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
