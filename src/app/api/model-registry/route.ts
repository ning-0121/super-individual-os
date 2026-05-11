import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { listAvailableProviders } from '@/lib/ai/model-router'

// GET /api/model-registry — public-ish (RLS allows authenticated read)
// Returns: { models, available_providers }
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { data: models } = await supabase
    .from('model_registry')
    .select('*')
    .order('sort_order', { ascending: true })

  return Response.json({
    models: models ?? [],
    available_providers: listAvailableProviders(),
  })
}
