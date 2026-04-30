import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { apiError } from '@/lib/observability'

/**
 * Admin-only: list recent task_runs across ALL users.
 * Auth: user must be in ADMIN_USER_IDS env.
 * Uses service role client to bypass RLS for cross-user view.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })
  if (!isAdmin(user.id)) return apiError('Forbidden', { status: 403, code: 'not_admin' })

  // Service-role client to read across all users (RLS bypass)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supaUrl) {
    return apiError('Service role not configured', { status: 503, code: 'service_role_missing' })
  }

  const admin = createAdminClient(supaUrl, serviceKey, { auth: { persistSession: false } })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const [runs, agents, tasks] = await Promise.all([
    admin.from('task_runs')
      .select('id, user_id, task_id, assigned_unit_id, run_status, retry_count, started_at, finished_at, error_message')
      .order('started_at', { ascending: false }).limit(limit),
    admin.from('execution_units').select('id, name, avatar, agent_type'),
    admin.from('tasks').select('id, title'),
  ])

  if (runs.error)   return apiError(runs.error.message,   { status: 500 })

  const agentMap = new Map((agents.data ?? []).map(a => [a.id as string, a]))
  const taskMap  = new Map((tasks.data ?? []).map(t => [t.id as string, t]))

  // Get user emails via admin auth API
  const userIds = [...new Set((runs.data ?? []).map(r => r.user_id as string))]
  const userMap = new Map<string, string>()
  for (const uid of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid)
      if (data.user) userMap.set(uid, data.user.email ?? '(no email)')
    } catch {
      userMap.set(uid, '(unknown)')
    }
  }

  const enriched = (runs.data ?? []).map(r => {
    const agent = r.assigned_unit_id ? agentMap.get(r.assigned_unit_id as string) : null
    const task  = r.task_id ? taskMap.get(r.task_id as string) : null
    return {
      id: r.id,
      user_id: r.user_id,
      user_email: userMap.get(r.user_id as string) ?? '(unknown)',
      task_id: r.task_id,
      task_title: task?.title ?? '(deleted)',
      agent_name: agent?.name ?? '(none)',
      agent_avatar: agent?.avatar ?? '',
      agent_type: agent?.agent_type ?? '',
      run_status: r.run_status,
      retry_count: r.retry_count ?? 0,
      started_at: r.started_at,
      finished_at: r.finished_at,
      duration_ms: r.finished_at && r.started_at
        ? new Date(r.finished_at as string).getTime() - new Date(r.started_at as string).getTime()
        : null,
      error_message: ((r.error_message as string) ?? '').slice(0, 200),
    }
  })

  return Response.json(enriched)
}
