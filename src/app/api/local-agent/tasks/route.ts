import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// GET /api/local-agent/tasks?agent_token=...
// Returns the queue of local-agent-targeted tool runs (status=pending_approval
// for local_agent capability) that this agent should execute.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const agent_token = searchParams.get('agent_token')
  if (!agent_token) return apiError('agent_token required', { status: 400 })

  // Validate session belongs to user
  const { data: session } = await supabase.from('local_agent_sessions')
    .select('id, status').eq('agent_token', agent_token).eq('user_id', user.id).maybeSingle()
  if (!session) return apiError('Unknown agent_token', { status: 404 })
  if (session.status === 'revoked') return apiError('Agent revoked', { status: 403 })

  const { data: runs } = await supabase.from('tool_runs')
    .select('id, action, params, risk_level, started_at')
    .eq('user_id', user.id)
    .eq('status', 'success')             // only execute approved-and-classified
    .ilike('action', 'local_agent.%')
    .gt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(20)

  return Response.json({
    session_id: session.id,
    tasks: (runs ?? []).map(r => ({
      tool_run_id: r.id,
      action: r.action,
      params: r.params,
      risk_level: r.risk_level,
      issued_at: r.started_at,
    })),
  })
}
