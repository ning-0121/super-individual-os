import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { classifyLocalAgentAction, deriveAgentStatus } from '@/lib/local-agent/policy'

// ─────────────────────────────────────────────────
// V3.1 — Local Agent request gateway (V0 = read-only)
// POST /api/local-agent/request
// Body: { action: string, params?: object }
//
// Pipeline:
//   1. Auth
//   2. Policy classify  → reject destructive / unknown immediately
//   3. Locate an online session (heartbeat ≤ 5min, status active/registered/idle)
//   4. Insert tool_run with status='pending_approval' (the desktop agent polls
//      /tasks and posts back via /results)
//   5. Audit
// ─────────────────────────────────────────────────

interface LocalAgentSessionRow {
  id: string
  status: string
  last_heartbeat: string | null
  capabilities: string[] | null
  hostname: string | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string; params?: Record<string, unknown> }
  const rawAction = (body.action ?? '').trim()
  const params = body.params ?? {}

  // Step 1 — Policy
  const verdict = classifyLocalAgentAction(rawAction)
  if (!verdict.allowed) {
    await audit(supabase, user.id, 'tool_call.executed', {
      resource_type: 'local_agent.request',
      metadata: { action: rawAction, allowed: false, reason: verdict.reason, category: verdict.category },
    })
    return Response.json({
      ok: false, allowed: false, category: verdict.category, reason: verdict.reason,
    }, { status: 403 })
  }

  // Step 2 — Find an online session
  const { data: sessions } = await supabase.from('local_agent_sessions')
    .select('id, status, last_heartbeat, capabilities, hostname')
    .eq('user_id', user.id)
    .order('last_heartbeat', { ascending: false, nullsFirst: false })
    .limit(5)

  const rows = (sessions ?? []) as LocalAgentSessionRow[]
  const online = rows.find(s => deriveAgentStatus(s) === 'online')
  if (!online) {
    return Response.json({
      ok: false, allowed: true, reason: 'No online local agent — start the desktop agent and try again',
      online_count: 0,
    }, { status: 503 })
  }

  // Step 3 — Insert tool_run (the desktop agent's GET /tasks picks this up)
  const action = `local_agent.${rawAction.trim().toLowerCase()}`
  const { data: inserted, error: insErr } = await supabase.from('tool_runs').insert({
    user_id: user.id,
    tool: 'local_agent',
    action,
    params: { ...params, session_id: online.id, hostname: online.hostname },
    status: 'pending_approval',     // V0 reads need no human gate, but the agent must execute → keep "pending" until /results lands
    risk_level: 0,
    required_approvers: [],
  }).select('id, started_at').single()

  if (insErr || !inserted) {
    return apiError('Failed to enqueue request', { status: 500 })
  }

  await audit(supabase, user.id, 'tool_call.executed', {
    resource_type: 'local_agent.request',
    resource_id: inserted.id,
    metadata: {
      action, allowed: true, category: verdict.category,
      session_id: online.id, hostname: online.hostname,
    },
  })

  return Response.json({
    ok: true, allowed: true, category: verdict.category,
    tool_run_id: inserted.id,
    session: { id: online.id, hostname: online.hostname },
    issued_at: inserted.started_at,
  })
}
