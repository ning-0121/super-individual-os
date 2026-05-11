import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { failStepRun } from '@/services/workflow-runtime'

// POST /api/workflow-step-runs/[id]/fail
// Body: { error_message: string }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { error_message?: string }
  const r = await failStepRun(supabase, user.id, id, body.error_message ?? 'unspecified failure')
  if (!r.ok) return apiError(r.error ?? 'failed', { status: 400 })
  return Response.json(r)
}
