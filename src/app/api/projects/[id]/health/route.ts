import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { computeProjectHealth, getOrCreateContext, getRecentActivity } from '@/services/project-context'

// GET /api/projects/[id]/health
// Returns: { health, advice, metrics, context_summary, recent_activity }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params

  const [healthResult, ctx, activity] = await Promise.all([
    computeProjectHealth(supabase, user.id, id),
    getOrCreateContext(supabase, user.id, id),
    getRecentActivity(supabase, user.id, id, 5),
  ])

  if (!ctx) return apiError('Project context not found', { status: 404 })

  return Response.json({
    ...healthResult,
    context_summary: {
      project_goal: ctx.project_goal,
      current_stage: ctx.current_stage,
      current_focus: ctx.current_focus,
      blockers: ctx.blockers,
      next_actions: ctx.next_actions,
      owner_execution_unit_id: ctx.owner_execution_unit_id,
      active_workflow_id: ctx.active_workflow_id,
      locked: ctx.locked,
      context_version: ctx.context_version,
    },
    recent_activity: activity,
  })
}
