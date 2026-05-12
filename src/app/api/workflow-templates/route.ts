import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { listTemplates } from '@/lib/workflows/templates'

// GET /api/workflow-templates — returns the 5 system templates
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  return Response.json({ templates: listTemplates() })
}
