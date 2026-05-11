import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { listAvailableProviders } from '@/lib/ai/model-router'

/**
 * V2.1 — Mission Control aggregator
 * Returns 6 widget payloads in one round-trip:
 * - system_matrix
 * - execution_pulse
 * - risk_radar
 * - manager_reports
 * - ceo_decisions
 * - auto_loop_status
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const since7d  = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [
    { data: systems },
    { data: systemProjects },
    { data: projects },
    { data: runs7d },
    { data: decisions7d },
    { data: pendingApprovals },
    { data: managers },
    { data: managerDecisions7d },
    { data: auditLogs7d },
  ] = await Promise.all([
    supabase.from('systems').select('*').eq('user_id', user.id),
    supabase.from('system_projects').select('system_id, project_id, role').eq('user_id', user.id),
    supabase.from('projects').select('id, name, status, current_stage').eq('user_id', user.id),
    supabase.from('task_runs')
      .select('id, run_status, started_at, finished_at, output_payload')
      .eq('user_id', user.id).gte('started_at', since7d)
      .order('started_at', { ascending: false }).limit(500),
    supabase.from('decision_logs')
      .select('id, mode, detected_mode, risk_flags, created_at')
      .eq('user_id', user.id).gte('created_at', since7d)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('approval_requests')
      .select('id, project_id, action_type, risk_level, required_approvers, created_at, classification_reason')
      .eq('user_id', user.id).eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('managers').select('*').eq('user_id', user.id),
    supabase.from('manager_decisions')
      .select('id, manager_id, decision_type, target_type, created_at, metadata')
      .eq('user_id', user.id).gte('created_at', since7d)
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('audit_logs')
      .select('event_type, created_at, metadata')
      .eq('user_id', user.id).gte('created_at', since7d)
      .order('created_at', { ascending: false }).limit(1000),
  ])

  // ─── 1. system_matrix ─────────────────────────────────────────
  const projectsBySystem = new Map<string, string[]>()
  for (const sp of (systemProjects ?? [])) {
    const arr = projectsBySystem.get(sp.system_id as string) ?? []
    arr.push(sp.project_id as string)
    projectsBySystem.set(sp.system_id as string, arr)
  }
  const projectMap = new Map((projects ?? []).map(p => [p.id as string, p]))

  const system_matrix = (systems ?? []).map(s => {
    const linkedIds = projectsBySystem.get(s.id as string) ?? []
    const linked = linkedIds
      .map(id => projectMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
    return {
      id: s.id, name: s.name, description: s.description,
      status: s.status,
      project_count: linked.length,
      projects: linked.map(p => ({ id: p.id, name: p.name, status: p.status, current_stage: p.current_stage })),
    }
  })

  // ─── 2. execution_pulse ───────────────────────────────────────
  const allRuns = runs7d ?? []
  const runs24h = allRuns.filter(r => new Date(r.started_at as string) >= new Date(since24h))
  const succeeded7d = allRuns.filter(r => ['succeeded', 'completed'].includes(String(r.run_status))).length
  const failed7d = allRuns.filter(r => r.run_status === 'failed').length
  const running = allRuns.filter(r => ['running', 'queued', 'pending'].includes(String(r.run_status))).length

  const finishedRuns = allRuns.filter(r => r.finished_at && r.started_at)
  const durations = finishedRuns.map(r =>
    new Date(r.finished_at as string).getTime() - new Date(r.started_at as string).getTime()
  ).sort((a, b) => a - b)
  const p50 = durations.length ? durations[Math.floor(durations.length * 0.5)] : 0
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : 0

  const execution_pulse = {
    runs_7d: allRuns.length,
    runs_24h: runs24h.length,
    succeeded_7d: succeeded7d,
    failed_7d: failed7d,
    running,
    success_rate: allRuns.length > 0 ? Math.round((succeeded7d / allRuns.length) * 100) : 0,
    p50_duration_ms: p50,
    p95_duration_ms: p95,
  }

  // ─── 3. risk_radar ────────────────────────────────────────────
  const flagCounts: Record<string, number> = {}
  for (const d of (decisions7d ?? [])) {
    const flags = (d.risk_flags ?? []) as Array<{ code?: string }>
    for (const f of flags) {
      if (f?.code) flagCounts[f.code] = (flagCounts[f.code] ?? 0) + 1
    }
  }
  const risk_radar = {
    decisions_7d: (decisions7d ?? []).length,
    top_flags: Object.entries(flagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([code, count]) => ({ code, count })),
  }

  // ─── 4. manager_reports ───────────────────────────────────────
  const managerById = new Map((managers ?? []).map(m => [m.id as string, m]))
  const decisionsByManager = new Map<string, { approve: number; reject: number; total: number }>()
  for (const d of (managerDecisions7d ?? [])) {
    const mid = d.manager_id as string
    const stats = decisionsByManager.get(mid) ?? { approve: 0, reject: 0, total: 0 }
    stats.total++
    if (d.decision_type === 'approve') stats.approve++
    if (d.decision_type === 'reject')  stats.reject++
    decisionsByManager.set(mid, stats)
  }
  const manager_reports = Array.from(decisionsByManager.entries()).map(([mid, stats]) => {
    const m = managerById.get(mid)
    return {
      manager_id: mid,
      role: m?.role ?? 'unknown',
      name: m?.name ?? 'Unknown',
      avatar: m?.avatar ?? '🧑‍💼',
      ...stats,
      approve_rate: stats.total > 0 ? Math.round((stats.approve / stats.total) * 100) : 0,
    }
  }).sort((a, b) => b.total - a.total)

  // ─── 5. ceo_decisions ─────────────────────────────────────────
  const ceoPending = (pendingApprovals ?? []).filter(a =>
    Array.isArray(a.required_approvers) && (a.required_approvers as string[]).includes('ceo')
  )
  const ceoRecent = (managerDecisions7d ?? []).filter(d => {
    const m = managerById.get(d.manager_id as string)
    return m?.role === 'ceo'
  }).slice(0, 5)
  const ceo_decisions = {
    pending_count: ceoPending.length,
    pending: ceoPending.slice(0, 5).map(a => ({
      id: a.id, action_type: a.action_type, risk_level: a.risk_level,
      classification_reason: a.classification_reason, created_at: a.created_at,
    })),
    recent: ceoRecent,
  }

  // ─── 5b. approval_inbox (V2.4) ────────────────────────────────
  // Pull risk_label aggregation from the existing pendingApprovals query
  const { data: inboxRows } = await supabase
    .from('approval_requests')
    .select('id, risk_label, risk_level, action_type, title, requested_by, created_at')
    .eq('user_id', user.id).eq('status', 'pending')
    .order('created_at', { ascending: false })
  const labelToCount: Record<'low'|'medium'|'high'|'critical', number> = {
    low: 0, medium: 0, high: 0, critical: 0,
  }
  for (const r of (inboxRows ?? [])) {
    const lbl = (r.risk_label as 'low'|'medium'|'high'|'critical' | null) ?? (
      (r.risk_level as number) <= 1 ? 'low' :
      (r.risk_level as number) === 2 ? 'medium' :
      (r.risk_level as number) === 3 ? 'high' : 'critical'
    )
    labelToCount[lbl]++
  }
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  const today_count = (inboxRows ?? []).filter(r => (r.created_at as string) >= todayIso).length

  const approval_inbox = {
    pending_total: (inboxRows ?? []).length,
    today_count,
    by_risk: labelToCount,
    recent: (inboxRows ?? []).slice(0, 5).map(r => ({
      id: r.id, action_type: r.action_type, risk_label: r.risk_label,
      title: r.title, requested_by: r.requested_by, created_at: r.created_at,
    })),
  }

  // ─── 6. auto_loop_status ──────────────────────────────────────
  const events = (auditLogs7d ?? [])
  const autoGranted = events.filter(e => e.event_type === 'auto_approval.granted').length
  const aiUnanimous = events.filter(e => e.event_type === 'ai_manager.unanimous_approve').length
  const aiRejected  = events.filter(e => e.event_type === 'ai_manager.rejected').length
  const blocked     = events.filter(e => e.event_type === 'dispatch.blocked').length
  const total = autoGranted + blocked
  // ─── 7. growth + tool status ──────────────────────────────────
  const [{ count: toolCount }, { count: growthRunning }] = await Promise.all([
    supabase.from('tool_integrations').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('auth_status', 'connected').eq('is_active', true),
    supabase.from('growth_experiments').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'running'),
  ])

  const auto_loop_status = {
    auto_approved_7d: autoGranted,
    ai_manager_unanimous_7d: aiUnanimous,
    ai_manager_rejected_7d: aiRejected,
    blocked_for_human_7d: blocked,
    autonomy_rate: total > 0 ? Math.round((autoGranted / total) * 100) : 0,
    pending_approvals: (pendingApprovals ?? []).length,
    available_providers: listAvailableProviders(),
    tool_connection_count: toolCount ?? 0,
    growth_loop_active: (growthRunning ?? 0) > 0,
  }

  // ─── 8. manager_reports — latest per role ─────────────────────
  const { data: latestReports } = await supabase
    .from('manager_reports')
    .select('role, summary, generated_at, source')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false }).limit(20)
  const seenRoles = new Set<string>()
  const manager_reports_summary = (latestReports ?? []).filter(r => {
    if (seenRoles.has(r.role as string)) return false
    seenRoles.add(r.role as string); return true
  }).map(r => ({
    role: r.role, summary: r.summary, source: r.source, generated_at: r.generated_at,
  }))

  // ─── 9. growth_loop ────────────────────────────────────────────
  const { data: exps } = await supabase
    .from('growth_experiments')
    .select('id, name, status, channel, current_value, target_value, system_id')
    .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(10)
  const growth_loop = {
    total: (exps ?? []).length,
    running: (exps ?? []).filter(e => e.status === 'running').length,
    planning: (exps ?? []).filter(e => e.status === 'planning').length,
    completed: (exps ?? []).filter(e => e.status === 'completed').length,
    recent: (exps ?? []).slice(0, 5),
  }

  // ─── 10. tool_autonomy ─────────────────────────────────
  const since24hForTools = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [
    { count: toolRunsTotal },
    { count: toolRunsFailed },
    { count: toolRunsBlocked },
    { data: recentFailedTools },
    { data: modelUsage },
  ] = await Promise.all([
    supabase.from('tool_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('started_at', since7d),
    supabase.from('tool_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'error').gte('started_at', since24hForTools),
    supabase.from('tool_runs').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).in('status', ['blocked', 'pending_approval']),
    supabase.from('tool_runs')
      .select('id, action, error_message, started_at')
      .eq('user_id', user.id).eq('status', 'error')
      .order('started_at', { ascending: false }).limit(5),
    supabase.from('model_runs').select('provider, input_tokens, output_tokens')
      .eq('user_id', user.id).gte('created_at', since7d),
  ])

  const modelUsageByProvider: Record<string, { runs: number; in: number; out: number }> = {}
  for (const m of (modelUsage ?? [])) {
    const p = String(m.provider)
    const u = modelUsageByProvider[p] ?? { runs: 0, in: 0, out: 0 }
    u.runs++; u.in += (m.input_tokens as number) ?? 0; u.out += (m.output_tokens as number) ?? 0
    modelUsageByProvider[p] = u
  }

  const tool_autonomy = {
    runs_7d: toolRunsTotal ?? 0,
    failed_24h: toolRunsFailed ?? 0,
    blocked_or_pending: toolRunsBlocked ?? 0,
    recent_failures: (recentFailedTools ?? []).map(r => ({
      id: r.id, action: r.action,
      error_message: ((r.error_message as string) ?? '').slice(0, 200),
      started_at: r.started_at,
    })),
    model_usage: Object.entries(modelUsageByProvider).map(([provider, u]) => ({
      provider, runs: u.runs, input_tokens: u.in, output_tokens: u.out,
    })),
  }

  return Response.json({
    system_matrix,
    execution_pulse,
    risk_radar,
    manager_reports,
    manager_reports_summary,
    ceo_decisions,
    approval_inbox,
    auto_loop_status,
    growth_loop,
    tool_autonomy,
    generated_at: new Date().toISOString(),
  })
}
