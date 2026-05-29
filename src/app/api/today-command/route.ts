import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { pickTodayCommand, type TodayInputs } from '@/lib/mission-control/today-command'
import { startOfToday } from '@/lib/cost/aggregate'

// GET /api/today-command
// Aggregates the 5 first-screen signals and runs the pure prioritizer.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const todayStart = startOfToday()

  // Pull in parallel
  const [
    { data: approvals },
    { data: managerReports },
    { data: lockedRows },
    { count: failedRuns24h },
    { data: mustTasks },
    { count: blockedWorkflows },
    { data: todayModelRuns },
  ] = await Promise.all([
    supabase.from('approval_requests')
      .select('id, title, action_type, risk_label, required_approvers, created_at')
      .eq('user_id', user.id).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(20),
    // Latest unread (or any) needs-intervention reports
    supabase.from('manager_reports')
      .select('id, role, summary, project_id, needs_user_intervention, generated_at')
      .eq('user_id', user.id).eq('needs_user_intervention', true)
      .order('generated_at', { ascending: false }).limit(10),
    supabase.from('project_contexts')
      .select('project_id, locked_at, current_focus, next_actions')
      .eq('user_id', user.id).eq('locked', true)
      .order('locked_at', { ascending: false }).limit(5),
    supabase.from('tool_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'error').gte('started_at', since24h),
    supabase.from('tasks').select('id, title, project_id')
      .eq('user_id', user.id).eq('priority', 'must')
      .not('workflow_status', 'in', '(completed,approved,archived)')
      .order('updated_at', { ascending: false }).limit(1),
    // Workflows stuck waiting on a human (blocked_approval) — the autonomy loop
    // can't clear these itself, so they belong on the "today" radar.
    supabase.from('workflow_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'blocked_approval'),
    // Today's model spend (summed in JS — cost_usd_estimated lives on each run).
    supabase.from('model_runs').select('cost_usd_estimated')
      .eq('user_id', user.id).gte('created_at', todayStart).limit(5000),
  ])

  // ─── Approval slices ───
  const pending = approvals ?? []
  const ceoPending = pending.filter(a =>
    Array.isArray(a.required_approvers) && (a.required_approvers as string[]).includes('ceo'))
  const criticalPending = pending.filter(a => a.risk_label === 'critical')
  const highPending = pending.filter(a => a.risk_label === 'high')
  const recent = pending[0]

  // ─── Manager intervention slice ───
  const mgr = (managerReports ?? [])[0]

  // ─── Locked + critical project slice ───
  // We need health for each locked project to find the critical one.
  // Do this in batch (best-effort — 5 max).
  let criticalProject:
    | { id: string; name: string; blockers: number; next_action: string | null }
    | null = null
  let locked: typeof lockedRows extends Array<infer T> | null ? T | null : null = null

  if ((lockedRows ?? []).length > 0) {
    const lockedIds = (lockedRows ?? []).map(l => l.project_id as string)
    const { data: projects } = await supabase.from('projects')
      .select('id, name').in('id', lockedIds)
    const nameById = new Map((projects ?? []).map(p => [p.id as string, p.name as string]))

    // Fast critical scan: any locked project with >= 4 blocked tasks OR no activity 7d
    // (full health computation lives in /api/projects/[id]/health — we approximate here)
    for (const lp of (lockedRows ?? [])) {
      const projId = lp.project_id as string
      const { data: tasks } = await supabase.from('tasks')
        .select('workflow_status, updated_at')
        .eq('user_id', user.id).eq('project_id', projId)
      const blockedThreshold = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
      const blocked = (tasks ?? []).filter(t => {
        if (['completed','approved','archived'].includes(String(t.workflow_status))) return false
        return ((t.updated_at as string | null) ?? '') < blockedThreshold
      }).length
      if (blocked >= 4 && !criticalProject) {
        const nextActions = (lp.next_actions ?? []) as Array<{ text: string }>
        criticalProject = {
          id: projId,
          name: nameById.get(projId) ?? '(unknown)',
          blockers: blocked,
          next_action: nextActions[0]?.text ?? null,
        }
      }
    }
    locked = lockedRows![0] as never
  }

  // ─── MUST task slice ───
  const mustTask = (mustTasks ?? [])[0]

  const inputs: TodayInputs = {
    ceo_pending_count: ceoPending.length,
    critical_pending_count: criticalPending.length,
    high_pending_count: highPending.length,
    recent_pending_title: recent?.title || recent?.action_type || null,
    recent_pending_id: recent?.id ?? null,
    recent_pending_risk_label: (recent?.risk_label as TodayInputs['recent_pending_risk_label']) ?? null,

    manager_intervention_count: (managerReports ?? []).length,
    manager_intervention_role: mgr?.role ?? null,
    manager_intervention_summary: mgr?.summary ?? null,
    manager_intervention_project_id: mgr?.project_id ?? null,

    critical_project_id: criticalProject?.id ?? null,
    critical_project_name: criticalProject?.name ?? null,
    critical_project_blockers: criticalProject?.blockers,
    critical_project_next_action: criticalProject?.next_action ?? null,

    locked_project_id: (locked as { project_id?: string } | null)?.project_id ?? null,
    locked_project_name: (locked as { project_id?: string } | null)?.project_id
      ? null
      : null,                                              // filled by name below
    locked_project_focus: (locked as { current_focus?: string } | null)?.current_focus ?? null,
    locked_project_next_action: (() => {
      const na = (locked as { next_actions?: Array<{ text: string }> } | null)?.next_actions
      return na && na[0]?.text ? na[0].text : null
    })(),

    failed_runs_24h: failedRuns24h ?? 0,
    top_open_must_task_title: mustTask?.title ?? null,
  }

  // Resolve locked project name if we have a locked row
  if (inputs.locked_project_id) {
    const { data: lp } = await supabase.from('projects')
      .select('name').eq('id', inputs.locked_project_id).maybeSingle()
    inputs.locked_project_name = (lp?.name as string) ?? null
  }

  const command = pickTodayCommand(inputs)

  return Response.json({
    command,
    inputs,
    counts: {
      pending_total: pending.length,
      ceo_pending: ceoPending.length,
      critical_pending: criticalPending.length,
      high_pending: highPending.length,
      manager_intervention: (managerReports ?? []).length,
      failed_runs_24h: failedRuns24h ?? 0,
      blocked_workflows: blockedWorkflows ?? 0,
      today_cost_usd: Math.round(
        (todayModelRuns ?? []).reduce(
          (s, r) => s + Number((r as { cost_usd_estimated?: number }).cost_usd_estimated ?? 0), 0,
        ) * 1_000_000,
      ) / 1_000_000,
    },
    generated_at: new Date().toISOString(),
  })
}
