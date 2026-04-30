import { createClient } from '@/lib/supabase/server'
import type { Task, Artifact, ExecutionUnit } from '@/types'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  // Fetch everything in parallel
  const [
    { data: project },
    { data: tasks },
    { data: runs },
    { data: reviews },
    { data: artifacts },
    { data: agents },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).eq('user_id', user.id).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).eq('user_id', user.id).order('created_at', { ascending: true }),
    supabase.from('task_runs').select('*').eq('user_id', user.id),
    supabase.from('task_reviews').select('*').eq('user_id', user.id),
    supabase.from('artifacts').select('*').eq('project_id', projectId).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('execution_units').select('*').eq('user_id', user.id),
  ])

  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const taskList = (tasks ?? []) as Task[]
  const taskIds  = new Set(taskList.map(t => t.id))

  // Filter runs/reviews to only those linked to this project's tasks
  const projectRuns    = (runs ?? []).filter(r => taskIds.has(r.task_id as string))
  const projectReviews = (reviews ?? []).filter(r => taskIds.has(r.task_id as string))

  // Index lookups
  const agentById = new Map<string, ExecutionUnit>()
  for (const a of (agents ?? []) as ExecutionUnit[]) agentById.set(a.id, a)

  const latestRunByTask = new Map<string, typeof projectRuns[number]>()
  for (const r of projectRuns) {
    const tid = r.task_id as string
    const existing = latestRunByTask.get(tid)
    if (!existing || new Date(r.started_at as string) > new Date(existing.started_at as string)) {
      latestRunByTask.set(tid, r)
    }
  }

  const reviewsByTask = new Map<string, typeof projectReviews>()
  for (const rv of projectReviews) {
    const arr = reviewsByTask.get(rv.task_id as string) ?? []
    arr.push(rv)
    reviewsByTask.set(rv.task_id as string, arr)
  }

  const artifactsByTask = new Map<string, Artifact[]>()
  for (const ar of (artifacts ?? []) as Artifact[]) {
    if (!ar.task_id) continue
    const arr = artifactsByTask.get(ar.task_id) ?? []
    arr.push(ar)
    artifactsByTask.set(ar.task_id, arr)
  }

  // Stats
  const stats = {
    total_tasks: taskList.length,
    completed: taskList.filter(t => ['completed', 'approved'].includes(t.workflow_status ?? '')).length,
    in_progress: taskList.filter(t => ['running', 'submitted', 'under_review'].includes(t.workflow_status ?? '')).length,
    blocked: taskList.filter(t => t.workflow_status === 'blocked').length,
    revision_required: taskList.filter(t => t.workflow_status === 'revision_required').length,
    not_started: taskList.filter(t => ['draft', 'planned', 'assigned'].includes(t.workflow_status ?? '')).length,
    total_runs: projectRuns.length,
    successful_runs: projectRuns.filter(r => ['succeeded', 'completed'].includes(String(r.run_status))).length,
    failed_runs: projectRuns.filter(r => r.run_status === 'failed').length,
    total_artifacts: (artifacts ?? []).length,
  }
  const completion_pct = stats.total_tasks > 0 ? Math.round((stats.completed / stats.total_tasks) * 100) : 0

  // Artifacts by type
  const artifacts_by_type: Record<string, number> = {}
  for (const a of (artifacts ?? [])) {
    const t = String(a.artifact_type)
    artifacts_by_type[t] = (artifacts_by_type[t] ?? 0) + 1
  }

  // Per-task summary
  const task_summaries = taskList.map(t => {
    const run = latestRunByTask.get(t.id)
    const taskReviews = reviewsByTask.get(t.id) ?? []
    const latestReview = taskReviews[0] ?? null
    const taskArtifacts = artifactsByTask.get(t.id) ?? []
    const agent = t.assigned_unit_id ? agentById.get(t.assigned_unit_id) : null

    const out = (run?.output_payload ?? {}) as { summary?: string; final_output?: string; output?: string; total_steps?: number; evaluation?: { verdict: string; score: number } }

    return {
      id: t.id,
      title: t.title,
      task_type: t.task_type,
      priority: t.priority,
      workflow_status: t.workflow_status,
      agent_name: agent?.name ?? '未分配',
      agent_avatar: agent?.avatar ?? '',
      agent_type: agent?.agent_type ?? null,
      latest_run: run ? {
        id: run.id,
        run_status: run.run_status,
        summary: out.summary ?? '',
        total_steps: out.total_steps ?? 0,
        retry_count: run.retry_count ?? 0,
        finished_at: run.finished_at,
        evaluation: out.evaluation ?? null,
      } : null,
      review: latestReview ? {
        id: latestReview.id,
        review_status: latestReview.review_status,
        score: latestReview.score,
        comments: latestReview.comments,
      } : null,
      artifacts: taskArtifacts.map(a => ({
        id: a.id,
        artifact_type: a.artifact_type,
        title: a.title,
        url: a.url,
      })),
      acceptance_criteria: t.acceptance_criteria,
      depends_on: ((t.context_payload ?? {}) as { depends_on?: string[] }).depends_on ?? [],
    }
  })

  // Blocked items
  const blocked_items = task_summaries.filter(t =>
    ['blocked', 'revision_required'].includes(t.workflow_status ?? '')
  )

  return Response.json({
    project,
    stats: { ...stats, completion_pct },
    artifacts_by_type,
    artifacts: artifacts ?? [],
    tasks: task_summaries,
    blocked_items,
    generated_at: new Date().toISOString(),
  })
}
