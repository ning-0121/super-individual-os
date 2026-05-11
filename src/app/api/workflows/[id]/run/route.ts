import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { startWorkflowRun } from '@/services/workflow-runtime'

// POST /api/workflows/[id]/run  → starts a new run
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const out = await startWorkflowRun(supabase, user.id, id)
  if (!out.ok) return apiError(out.error ?? 'failed', { status: 400 })
  return Response.json({ ok: true, run_id: out.run_id })
}
