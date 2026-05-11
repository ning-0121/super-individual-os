import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { generateHandoff } from '@/services/project-context'

// POST /api/projects/[id]/handoff — Generate Handoff Summary
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const summary = await generateHandoff(supabase, user.id, id)
  if (!summary) return apiError('Could not generate handoff', { status: 400 })
  return Response.json({ summary })
}
