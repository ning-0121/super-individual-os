import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { advanceWorkflowRun } from '@/services/workflow-runtime'

// POST /api/workflow-runs/[id]/advance — idempotent driver tick
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const r = await advanceWorkflowRun(supabase, user.id, id)
  return Response.json(r)
}
