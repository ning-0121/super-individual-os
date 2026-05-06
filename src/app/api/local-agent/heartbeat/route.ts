import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// POST /api/local-agent/heartbeat
// Body: { agent_token, status?: 'active' | 'idle' }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as { agent_token?: string; status?: string }
  if (!body.agent_token) return apiError('agent_token required', { status: 400 })

  const status = body.status === 'idle' ? 'idle' : 'active'

  const { error } = await supabase.from('local_agent_sessions')
    .update({ last_heartbeat: new Date().toISOString(), status })
    .eq('agent_token', body.agent_token)
    .eq('user_id', user.id)
    .neq('status', 'revoked')

  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true, ts: new Date().toISOString() })
}
