import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionUnit } from '@/types'

// ─────────────────────────────────────────────────
// V1.8 — Project scope resolver
// Used by run-pipeline / chat / orchestrator to compute
// effective agent/tool sets for a given (user, project).
// ─────────────────────────────────────────────────

export interface ResolvedAgent {
  unit: ExecutionUnit
  is_enabled: boolean
  system_prompt: string                 // override > unit.system_prompt
  tools_allowed: string[]               // override > unit.tools_allowed
  settings: Record<string, unknown>
}

/**
 * Get all enabled agents for a project, with project-level overrides applied.
 * If a project has no project_agents rows, ALL of the user's active agents
 * are considered enabled (backward-compatible default).
 */
export async function resolveProjectAgents(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<ResolvedAgent[]> {
  const [{ data: units }, { data: pa }] = await Promise.all([
    supabase
      .from('execution_units')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase
      .from('project_agents')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId),
  ])

  const all = (units ?? []) as ExecutionUnit[]
  const grants = (pa ?? []) as Array<{
    execution_unit_id: string
    is_enabled: boolean
    system_prompt_override: string
    tools_allowed_override: string[] | null
    settings: Record<string, unknown>
  }>

  // No grants for this project → all units enabled (default)
  if (grants.length === 0) {
    return all.map(u => ({
      unit: u,
      is_enabled: true,
      system_prompt: u.system_prompt ?? '',
      tools_allowed: (u.tools_allowed ?? []) as string[],
      settings: {},
    }))
  }

  // Has grants → only those rows matter
  const grantById = new Map(grants.map(g => [g.execution_unit_id, g]))
  return all.map(u => {
    const g = grantById.get(u.id)
    return {
      unit: u,
      is_enabled: g ? g.is_enabled : false,           // not granted = disabled
      system_prompt: g?.system_prompt_override?.trim() ? g.system_prompt_override : (u.system_prompt ?? ''),
      tools_allowed: g?.tools_allowed_override ?? ((u.tools_allowed ?? []) as string[]),
      settings: g?.settings ?? {},
    }
  })
}

/**
 * Resolve a single agent (lookup + override) for the given (project, unit).
 * Used by run-task to apply per-project prompt overrides at execution time.
 */
export async function resolveAgentForRun(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
  unit: ExecutionUnit,
): Promise<{ system_prompt: string; tools_allowed: string[]; is_enabled: boolean }> {
  if (!projectId) {
    return {
      system_prompt: unit.system_prompt ?? '',
      tools_allowed: (unit.tools_allowed ?? []) as string[],
      is_enabled: true,
    }
  }

  const { data: grant } = await supabase
    .from('project_agents')
    .select('is_enabled, system_prompt_override, tools_allowed_override')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('execution_unit_id', unit.id)
    .maybeSingle()

  if (!grant) {
    // No grant → default to enabled with unit's own settings
    return {
      system_prompt: unit.system_prompt ?? '',
      tools_allowed: (unit.tools_allowed ?? []) as string[],
      is_enabled: true,
    }
  }

  return {
    is_enabled: grant.is_enabled as boolean,
    system_prompt: (grant.system_prompt_override as string)?.trim()
      ? (grant.system_prompt_override as string)
      : (unit.system_prompt ?? ''),
    tools_allowed: (grant.tools_allowed_override as string[] | null) ?? ((unit.tools_allowed ?? []) as string[]),
  }
}

/**
 * List tools allowed for this project (grants ∩ user-connected).
 * If no grants exist, all of the user's connected tools apply.
 */
export async function resolveProjectTools(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
): Promise<string[]> {
  const { data: connected } = await supabase
    .from('tool_integrations')
    .select('id, tool_name')
    .eq('user_id', userId)
    .eq('auth_status', 'connected')
    .eq('is_active', true)

  const connectedList = (connected ?? []) as Array<{ id: string; tool_name: string }>
  if (!projectId || connectedList.length === 0) return connectedList.map(c => c.tool_name)

  const { data: grants } = await supabase
    .from('project_tool_grants')
    .select('tool_integration_id, is_enabled')
    .eq('user_id', userId)
    .eq('project_id', projectId)

  const grantList = (grants ?? []) as Array<{ tool_integration_id: string; is_enabled: boolean }>
  if (grantList.length === 0) return connectedList.map(c => c.tool_name)   // no grants = all allowed

  const enabledIds = new Set(grantList.filter(g => g.is_enabled).map(g => g.tool_integration_id))
  return connectedList.filter(c => enabledIds.has(c.id)).map(c => c.tool_name)
}
