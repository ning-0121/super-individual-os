import { createClient } from '@/lib/supabase/server'
import { seedDefaultAgents } from '@/services/agents'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Auto-seed defaults if none exist
  await seedDefaultAgents(user.id)

  // Fetch agents + runs + reviews in parallel
  const [
    { data: agents },
    { data: runs },
    { data: reviews },
  ] = await Promise.all([
    supabase.from('execution_units').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    supabase.from('task_runs').select('assigned_unit_id, task_id, run_status').eq('user_id', user.id),
    supabase.from('task_reviews').select('task_id, review_status, score').eq('user_id', user.id),
  ])

  // Index reviews by task_id (a task may have multiple reviews; we use the latest approved/revision)
  const reviewsByTask = new Map<string, { status: string; score: number }[]>()
  for (const r of reviews ?? []) {
    if (!r.task_id) continue
    const arr = reviewsByTask.get(r.task_id) ?? []
    arr.push({ status: r.review_status, score: r.score ?? 0 })
    reviewsByTask.set(r.task_id, arr)
  }

  // Aggregate stats per agent
  type Stats = { total_runs: number; completed: number; failed: number; approved: number; revisions: number; rejected: number; scores: number[] }
  const statsByAgent = new Map<string, Stats>()

  for (const run of runs ?? []) {
    if (!run.assigned_unit_id) continue
    const s: Stats = statsByAgent.get(run.assigned_unit_id) ?? { total_runs: 0, completed: 0, failed: 0, approved: 0, revisions: 0, rejected: 0, scores: [] }
    s.total_runs++
    if (run.run_status === 'completed') s.completed++
    if (run.run_status === 'failed')    s.failed++

    const taskReviews = reviewsByTask.get(run.task_id) ?? []
    for (const rv of taskReviews) {
      if (rv.status === 'approved')          { s.approved++; if (rv.score > 0) s.scores.push(rv.score) }
      else if (rv.status === 'revision_required') s.revisions++
      else if (rv.status === 'rejected')     s.rejected++
    }
    statsByAgent.set(run.assigned_unit_id, s)
  }

  // Enrich agents with stats
  const enriched = (agents ?? []).map(a => {
    const s = statsByAgent.get(a.id) ?? { total_runs: 0, completed: 0, failed: 0, approved: 0, revisions: 0, rejected: 0, scores: [] }
    const avg = s.scores.length > 0 ? s.scores.reduce((x, y) => x + y, 0) / s.scores.length : 0
    return {
      ...a,
      stats: {
        total_runs: s.total_runs,
        approved_count: s.approved,
        revision_count: s.revisions,
        failed_count: s.failed,
        rejected_count: s.rejected,
        approval_rate: s.total_runs > 0 ? Math.round((s.approved / s.total_runs) * 100) : 0,
        average_score: Math.round(avg * 10) / 10,
      },
    }
  })

  return Response.json(enriched)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('execution_units')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return new Response(error.message, { status: 400 })
  return Response.json(data, { status: 201 })
}
