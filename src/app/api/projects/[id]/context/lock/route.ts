import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { setContextLock } from '@/services/project-context'
import { audit } from '@/lib/audit'

// POST /api/projects/[id]/context/lock
// Body: { locked: boolean }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { locked?: boolean }
  const locked = body.locked !== false   // default true

  const ctx = await setContextLock(supabase, user.id, id, locked)
  if (!ctx) return apiError('Failed to set lock', { status: 400 })

  const eventName = (locked ? 'project.context_locked' : 'project.context_unlocked') as never
  await audit(supabase, user.id, eventName, {
    resource_type: 'project_context', resource_id: ctx.id,
    metadata: { project_id: id, locked },
  } as never)

  return Response.json({ context: ctx })
}
