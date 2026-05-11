import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import {
  getOrCreateContext, updateContext, appendActivity, getRecentActivity,
} from '@/services/project-context'
import type { ProjectContext } from '@/types'

// GET /api/projects/[id]/context — returns the full context + 10 recent activities
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const ctx = await getOrCreateContext(supabase, user.id, id)
  if (!ctx) return apiError('Context not found', { status: 404 })

  const activity = await getRecentActivity(supabase, user.id, id, 10)
  return Response.json({ context: ctx, activity })
}

// PATCH /api/projects/[id]/context — partial update.
// Any free-form patch is allowed; a 'context_update' activity is logged.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as Partial<ProjectContext>

  // Ensure existence then patch
  const before = await getOrCreateContext(supabase, user.id, id)
  if (!before) return apiError('Could not create/load context', { status: 500 })

  // Bump version on every patch
  const patch: Partial<ProjectContext> = {
    ...body,
    context_version: (before.context_version ?? 1) + 1,
  }
  const next = await updateContext(supabase, user.id, id, patch)
  if (!next) return apiError('Update failed', { status: 400 })

  // Record activity (do not bump version again — pass as context_update only)
  await appendActivity(supabase, user.id, id, {
    activity_type: 'context_update',
    title: 'Context updated by user',
    summary: Object.keys(body).join(', '),
  })

  return Response.json({ context: next })
}
