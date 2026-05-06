import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { randomBytes } from 'crypto'

// POST /api/local-agent/register
// Body: { hostname?: string, os?: string, cursor_version?: string, capabilities?: string[] }
// Returns: { agent_token, session_id }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    hostname?: string; os?: string; cursor_version?: string; capabilities?: string[]
  }

  // Token format: la_<32 hex chars>
  const agent_token = `la_${randomBytes(16).toString('hex')}`

  const { data, error } = await supabase.from('local_agent_sessions').insert({
    user_id: user.id,
    agent_token,
    hostname: body.hostname ?? '',
    os: body.os ?? '',
    cursor_version: body.cursor_version ?? '',
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
    status: 'registered',
  }).select('id').single()

  if (error || !data) return apiError(error?.message ?? 'register failed', { status: 400 })

  await audit(supabase, user.id, 'local_agent.registered' as never, {
    resource_type: 'local_agent_session', resource_id: data.id,
    metadata: { hostname: body.hostname, os: body.os },
  } as never)

  return Response.json({ ok: true, agent_token, session_id: data.id }, { status: 201 })
}
