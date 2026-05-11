import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { listActiveWorkflowRuns } from '@/services/workflow-runtime'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const rows = await listActiveWorkflowRuns(supabase, user.id, 10)
  return Response.json({ runs: rows })
}
