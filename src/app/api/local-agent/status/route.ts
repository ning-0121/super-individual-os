import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import {
  deriveAgentStatus, listReadOnlyActions, listDestructiveActions,
} from '@/lib/local-agent/policy'

// GET /api/local-agent/status
// Returns: sessions[] (with derived status), allowed/blocked action lists,
// recent local_agent tool runs.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { data: sessionsRaw } = await supabase.from('local_agent_sessions')
    .select('id, hostname, os, cursor_version, capabilities, status, last_heartbeat, registered_at, revoked_at')
    .eq('user_id', user.id)
    .order('last_heartbeat', { ascending: false, nullsFirst: false })
    .limit(10)

  const sessions = (sessionsRaw ?? []).map(s => ({
    ...s,
    derived_status: deriveAgentStatus({
      status: s.status as string,
      last_heartbeat: s.last_heartbeat as string | null,
    }),
  }))

  const online_count = sessions.filter(s => s.derived_status === 'online').length

  const { data: recent } = await supabase.from('tool_runs')
    .select('id, action, status, started_at, finished_at, error_message, result')
    .eq('user_id', user.id)
    .eq('tool', 'local_agent')
    .order('started_at', { ascending: false })
    .limit(20)

  const all = recent ?? []
  const pending = all.filter(r => r.status === 'pending_approval')
  const last_success = all.find(r => r.status === 'success') ?? null
  const last_error   = all.find(r => r.status === 'error') ?? null

  return Response.json({
    online_count,
    sessions,
    capabilities: {
      allowed: listReadOnlyActions(),
      blocked: listDestructiveActions(),
    },
    recent_runs: all.slice(0, 10),
    pending,
    last_success,
    last_error,
  })
}
