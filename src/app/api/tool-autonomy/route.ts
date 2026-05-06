import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { TOOL_CAPABILITIES } from '@/lib/tools/capabilities'
import { listAvailableProviders } from '@/lib/ai/model-router'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [
    { data: integrations },
    { data: toolRuns },
    { data: blockedRuns },
    { data: modelRuns },
    { data: localAgents },
  ] = await Promise.all([
    supabase.from('tool_integrations')
      .select('tool_name, auth_status, is_active').eq('user_id', user.id),
    supabase.from('tool_runs')
      .select('id, tool, action, status, risk_level, started_at, duration_ms, error_message')
      .eq('user_id', user.id).gte('started_at', since7d)
      .order('started_at', { ascending: false }).limit(20),
    supabase.from('tool_runs')
      .select('id, action, status, risk_level, started_at, required_approvers')
      .eq('user_id', user.id).in('status', ['blocked', 'pending_approval'])
      .order('started_at', { ascending: false }).limit(10),
    supabase.from('model_runs')
      .select('provider, model, agent_type, input_tokens, output_tokens, duration_ms, status, created_at')
      .eq('user_id', user.id).gte('created_at', since7d)
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('local_agent_sessions')
      .select('id, hostname, os, status, last_heartbeat, capabilities').eq('user_id', user.id)
      .order('registered_at', { ascending: false }),
  ])

  // Aggregate model usage by provider
  const usage = new Map<string, { runs: number; input_tokens: number; output_tokens: number }>()
  for (const r of modelRuns ?? []) {
    const key = String(r.provider)
    const u = usage.get(key) ?? { runs: 0, input_tokens: 0, output_tokens: 0 }
    u.runs++
    u.input_tokens += (r.input_tokens as number) ?? 0
    u.output_tokens += (r.output_tokens as number) ?? 0
    usage.set(key, u)
  }

  return Response.json({
    capabilities: TOOL_CAPABILITIES,
    connected_tools: (integrations ?? []).filter(i => i.auth_status === 'connected' && i.is_active).map(i => i.tool_name),
    available_providers: listAvailableProviders(),
    recent_tool_runs: toolRuns ?? [],
    blocked_tool_runs: blockedRuns ?? [],
    model_usage: Array.from(usage.entries()).map(([provider, u]) => ({ provider, ...u })),
    recent_model_runs: (modelRuns ?? []).slice(0, 10),
    local_agents: localAgents ?? [],
    generated_at: new Date().toISOString(),
  })
}
