import { createClient } from '@/lib/supabase/server'
import { TOOL_REGISTRY } from '@/lib/tools/router'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { tool_name, config } = await req.json() as { tool_name: string; config: Record<string, unknown> }
  const handler = TOOL_REGISTRY[tool_name]
  if (!handler) return Response.json({ ok: false, message: 'Tool not registered' }, { status: 400 })
  if (!handler.validateConfig) return Response.json({ ok: true, message: 'No validator (assumed valid)' })

  const result = await handler.validateConfig(config)
  return Response.json(result)
}
