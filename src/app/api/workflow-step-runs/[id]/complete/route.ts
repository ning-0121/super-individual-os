import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { completeStepRun } from '@/services/workflow-runtime'

// POST /api/workflow-step-runs/[id]/complete
// Body: { result?: object }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { result?: Record<string, unknown> }
  const r = await completeStepRun(supabase, user.id, id, body.result ?? {})
  if (!r.ok) return apiError(r.error ?? 'failed', { status: 400 })
  return Response.json(r)
}
