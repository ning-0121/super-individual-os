import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'

/**
 * GET /api/approval-requests?status=pending&projectId=...&enrich=true
 *
 * When `enrich=true` (default), each row is augmented with project_name and
 * task_title — used by the /approvals UI.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') ?? 'pending'
  const projectId  = searchParams.get('projectId')
  const taskId     = searchParams.get('taskId')
  const enrich     = searchParams.get('enrich') !== 'false'
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  let query = supabase
    .from('approval_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)
  if (taskId)    query = query.eq('task_id', taskId)

  const { data: rows, error } = await query
  if (error) return apiError(error.message, { status: 400 })

  const requests = rows ?? []
  if (!enrich || requests.length === 0) return Response.json(requests)

  const projectIds = [...new Set(requests.map(r => r.project_id as string).filter(Boolean))]
  const taskIds    = [...new Set(requests.map(r => r.task_id as string).filter(Boolean))]

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    taskIds.length
      ? supabase.from('tasks').select('id, title, task_type').in('id', taskIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; task_type: string }> }),
  ])

  const projectMap = new Map((projects ?? []).map(p => [p.id as string, p.name as string]))
  const taskMap    = new Map((tasks ?? []).map(t => [t.id as string, { title: t.title as string, task_type: t.task_type as string }]))

  const enriched = requests.map(r => ({
    ...r,
    project_name: r.project_id ? (projectMap.get(r.project_id as string) ?? '(unknown)') : null,
    task_title: r.task_id ? (taskMap.get(r.task_id as string)?.title ?? '(deleted)') : null,
    task_type: r.task_id ? (taskMap.get(r.task_id as string)?.task_type ?? '') : null,
  }))

  return Response.json(enriched)
}
