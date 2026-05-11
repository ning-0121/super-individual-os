import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { assessTaskFocus } from '@/lib/project-context/health'
import { getOrCreateContext } from '@/services/project-context'

// POST /api/projects/[id]/focus-check
// Body: { task_title: string, task_description?: string }
// Returns: { off_focus, similarity, reason?, locked }
// The UI is expected to surface a confirm dialog when off_focus = true AND
// locked = true; otherwise create the task silently.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { task_title?: string; task_description?: string }
  if (!body.task_title) return apiError('task_title required', { status: 400 })

  const ctx = await getOrCreateContext(supabase, user.id, id)
  if (!ctx) return apiError('Project context not found', { status: 404 })

  const verdict = assessTaskFocus({
    task_title: body.task_title,
    task_description: body.task_description,
    project_goal: ctx.project_goal,
    current_focus: ctx.current_focus,
  })

  return Response.json({
    ...verdict,
    locked: ctx.locked,
    project_goal: ctx.project_goal,
    current_focus: ctx.current_focus,
  })
}
