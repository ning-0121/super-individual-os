import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { ensureExecutorAgents, listExecutorAgents } from '@/services/ensure-agents'

// GET  /api/projects/ensure-agents → { has_executor, agents }
// POST /api/projects/ensure-agents → idempotently provision executor agents
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const agents = await listExecutorAgents(supabase, user.id)
  return Response.json({ has_executor: agents.length > 0, agents })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  try {
    const result = await ensureExecutorAgents(supabase, user.id)
    if (result.created > 0) {
      await audit(supabase, user.id, 'system.created', {
        resource_type: 'execution_unit',
        metadata: { source: 'ensure_agents', created: result.created },
      })
    }
    return Response.json({ ok: true, ...result, has_executor: result.agents.length > 0 })
  } catch (e) {
    return apiError(e instanceof Error ? e.message : String(e), { status: 500 })
  }
}
