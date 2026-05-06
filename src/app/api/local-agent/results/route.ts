import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// POST /api/local-agent/results
// Body: { agent_token, tool_run_id, status: 'success' | 'error', result?, error_message?, duration_ms? }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    agent_token?: string; tool_run_id?: string;
    status?: 'success' | 'error';
    result?: Record<string, unknown>;
    error_message?: string;
    duration_ms?: number;
  }
  if (!body.agent_token || !body.tool_run_id || !body.status) {
    return apiError('agent_token + tool_run_id + status required', { status: 400 })
  }

  // Validate agent
  const { data: session } = await supabase.from('local_agent_sessions')
    .select('id, status').eq('agent_token', body.agent_token).eq('user_id', user.id).maybeSingle()
  if (!session) return apiError('Unknown agent_token', { status: 404 })
  if (session.status === 'revoked') return apiError('Agent revoked', { status: 403 })

  const { error } = await supabase.from('tool_runs').update({
    status: body.status,
    result: body.result ?? {},
    error_message: body.error_message ?? null,
    duration_ms: body.duration_ms ?? 0,
    finished_at: new Date().toISOString(),
  }).eq('id', body.tool_run_id).eq('user_id', user.id)

  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
