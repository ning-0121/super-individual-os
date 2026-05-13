import { apiError } from '@/lib/observability'
import { resolveAgentAuth } from '@/lib/local-agent/auth'
import { isReadOnlyAction } from '@/lib/local-agent/policy'

// ─────────────────────────────────────────────────
// GET /api/local-agent/pending
// Auth: Authorization: Bearer la_<token> (or x-agent-token)
// Returns: { tasks: [{ tool_run_id, action, params, issued_at }, ...] }
//
// Returns ONLY tool_runs that:
//   - belong to the authenticated session's user_id
//   - tool='local_agent'
//   - status='pending_approval'   (the runner takes them through to terminal)
//   - action is a read-only verb (defence in depth — even if a bogus row
//     leaked in, the runner would reject it locally too)
// ─────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = await resolveAgentAuth(req)
  if (!auth) return apiError('Invalid or revoked agent token', { status: 401 })

  // Heartbeat-on-poll: update last_heartbeat so dashboards see the runner alive.
  await auth.supabase.from('local_agent_sessions')
    .update({ last_heartbeat: new Date().toISOString(), status: 'active' })
    .eq('id', auth.session.id)

  const { data: runs } = await auth.supabase.from('tool_runs')
    .select('id, action, params, risk_level, started_at')
    .eq('user_id', auth.session.user_id)
    .eq('tool', 'local_agent')
    .eq('status', 'pending_approval')
    .order('started_at', { ascending: true })
    .limit(20)

  const tasks = (runs ?? [])
    .map(r => {
      const verb = String(r.action).replace(/^local_agent\./, '')
      return { row: r, verb }
    })
    .filter(t => isReadOnlyAction(t.verb))
    .map(t => ({
      tool_run_id: t.row.id,
      action: t.verb,
      params: t.row.params,
      risk_level: t.row.risk_level,
      issued_at: t.row.started_at,
    }))

  return Response.json({
    session_id: auth.session.id,
    hostname: auth.session.hostname,
    count: tasks.length,
    tasks,
  })
}
