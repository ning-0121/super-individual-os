import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { resolveAgentAuth } from '@/lib/local-agent/auth'
import { nextRunTransition } from '@/lib/local-agent/state'

// ─────────────────────────────────────────────────
// POST /api/local-agent/result
// Auth: Authorization: Bearer la_<token>
// Body: {
//   tool_run_id: uuid,
//   status: 'success' | 'error',
//   result?: object,            // JSON-safe payload
//   error_message?: string,
//   duration_ms?: number,
// }
//
// Transitions pending_approval → success / error.
// Idempotent on terminal states (success/error stay put).
// ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = await resolveAgentAuth(req)
  if (!auth) return apiError('Invalid or revoked agent token', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    tool_run_id?: string
    status?: 'success' | 'error'
    result?: Record<string, unknown>
    error_message?: string
    duration_ms?: number
  }
  if (!body.tool_run_id) return apiError('tool_run_id required', { status: 400 })
  if (body.status !== 'success' && body.status !== 'error') {
    return apiError('status must be success or error', { status: 400 })
  }

  // Fetch the row first to verify ownership and current state.
  const { data: row } = await auth.supabase.from('tool_runs')
    .select('id, action, tool, status, user_id')
    .eq('id', body.tool_run_id)
    .maybeSingle()
  if (!row) return apiError('tool_run not found', { status: 404 })
  if (row.user_id !== auth.session.user_id) return apiError('Forbidden', { status: 403 })
  if (row.tool !== 'local_agent') return apiError('Not a local_agent tool_run', { status: 400 })

  const transition = nextRunTransition(
    { status: row.status, action: row.action },
    {
      posted_status: body.status,
      result: body.result,
      error_message: body.error_message,
      duration_ms: body.duration_ms,
    },
  )

  if (transition.action === 'reject') {
    await audit(auth.supabase, auth.session.user_id, 'tool_call.executed', {
      resource_type: 'local_agent.result',
      resource_id: row.id,
      metadata: { rejected: true, reason: transition.reason, action: row.action },
    })
    return apiError(transition.reason, { status: 403 })
  }
  if (transition.action === 'idempotent') {
    return Response.json({ ok: true, idempotent: true, status: transition.current })
  }

  const { error: upErr } = await auth.supabase.from('tool_runs')
    .update(transition.update)
    .eq('id', row.id)
  if (upErr) return apiError(upErr.message, { status: 500 })

  const verb = String(row.action).replace(/^local_agent\./, '')
  await audit(auth.supabase, auth.session.user_id, 'tool_call.executed', {
    resource_type: 'local_agent.result',
    resource_id: row.id,
    metadata: {
      verb, status: body.status,
      duration_ms: body.duration_ms ?? null,
      session_id: auth.session.id,
      hostname: auth.session.hostname,
      error_message: body.error_message ?? null,
    },
  })

  return Response.json({ ok: true, tool_run_id: row.id, status: body.status })
}
