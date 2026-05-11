import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { cancelWorkflowRun } from '@/services/workflow-runtime'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const { id } = await params
  const r = await cancelWorkflowRun(supabase, user.id, id)
  return Response.json(r)
}
