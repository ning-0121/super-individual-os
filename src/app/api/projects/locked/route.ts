import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

// GET /api/projects/locked → returns currently-locked project contexts (max 5).
// Used by /chat and /mission-control to surface active locked context.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { data } = await supabase.from('project_contexts')
    .select('project_id, locked_at, context_version, current_focus, project_goal')
    .eq('user_id', user.id).eq('locked', true)
    .order('locked_at', { ascending: false }).limit(5)

  const projectIds = (data ?? []).map(d => d.project_id as string)
  let nameMap = new Map<string, string>()
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from('projects')
      .select('id, name').in('id', projectIds)
    nameMap = new Map((projects ?? []).map(p => [p.id as string, p.name as string]))
  }

  return Response.json({
    locked: (data ?? []).map(d => ({
      project_id: d.project_id,
      project_name: nameMap.get(d.project_id as string) ?? '(unknown)',
      locked_at: d.locked_at,
      context_version: d.context_version,
      current_focus: d.current_focus,
      project_goal: d.project_goal,
    })),
  })
}
