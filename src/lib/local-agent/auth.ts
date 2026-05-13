import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────
// V3.1 — Agent-token auth resolver
// Used by daemon endpoints (pending, result, heartbeat-from-runner).
//
// Token is supplied via either:
//   Authorization: Bearer la_<32hex>
//   x-agent-token: la_<32hex>
//
// Returns the matched session and a service-role supabase client so the
// caller can scope by user_id.
// ─────────────────────────────────────────────────

export interface AgentAuth {
  supabase: SupabaseClient
  session: {
    id: string
    user_id: string
    status: string
    hostname: string | null
  }
}

export function extractAgentToken(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim()
  }
  const h = req.headers.get('x-agent-token')
  return h ? h.trim() : null
}

export async function resolveAgentAuth(req: Request): Promise<AgentAuth | null> {
  const token = extractAgentToken(req)
  if (!token || !/^la_[a-f0-9]{16,}$/i.test(token)) return null

  const supabase = createAdminClient()
  const { data: session } = await supabase.from('local_agent_sessions')
    .select('id, user_id, status, hostname')
    .eq('agent_token', token)
    .maybeSingle()
  if (!session) return null
  if (session.status === 'revoked') return null
  return { supabase, session: session as AgentAuth['session'] }
}
