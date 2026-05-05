import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  System, SystemRuntimeStatus, SystemRiskLevel, SystemOverview, ManagerRole,
} from '@/types'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.1+ — Systems service
// ─────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000

export async function createSystem(
  supabase: SupabaseClient,
  userId: string,
  input: { name: string; description?: string; project_ids?: string[] },
): Promise<System | null> {
  const { data, error } = await supabase.from('systems').insert({
    user_id: userId, name: input.name, description: input.description ?? '',
    status: 'active',
  }).select().single()
  if (error || !data) {
    logger.warn('system.create_fail', { error_message: error?.message })
    return null
  }
  if (input.project_ids?.length) {
    await supabase.from('system_projects').insert(
      input.project_ids.map(pid => ({
        user_id: userId, system_id: data.id, project_id: pid, role: 'member',
      })),
    )
  }
  return data as System
}

export async function getSystems(supabase: SupabaseClient, userId: string): Promise<System[]> {
  const { data } = await supabase.from('systems').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false })
  return (data ?? []) as System[]
}

export async function linkProjectToSystem(
  supabase: SupabaseClient, userId: string,
  systemId: string, projectId: string, role: 'primary' | 'member' = 'member',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('system_projects').insert({
    user_id: userId, system_id: systemId, project_id: projectId, role,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─────────────────────────────────────────────────
// Pure status calculation — exposed for unit tests
// ─────────────────────────────────────────────────
export interface StatusCalcInput {
  open_tasks: number
  total_tasks?: number
  failed_runs_24h: number
  runs_in_last_6h: number
  runs_in_last_48h: number
}

export function computeStatus(input: StatusCalcInput): SystemRuntimeStatus {
  if (input.failed_runs_24h > 0) return 'error'
  if (input.runs_in_last_6h > 0) return 'running'
  if (input.open_tasks > 0 && input.runs_in_last_48h === 0) return 'blocked'
  return 'idle'
}

export function computeProgress(input: { completed_tasks: number; total_tasks: number }): number {
  if (input.total_tasks === 0) return 0
  return Math.round((input.completed_tasks / input.total_tasks) * 100)
}

export interface RiskCalcInput {
  failed_runs_24h: number
  blocked_tasks: number
  pending_ceo_approvals: number
  no_activity_hours: number          // hours since last run
}

export function computeRisk(input: RiskCalcInput): SystemRiskLevel {
  let score = 0
  if (input.failed_runs_24h >= 3)        score += 2
  else if (input.failed_runs_24h >= 1)   score += 1
  if (input.blocked_tasks >= 3)          score += 2
  else if (input.blocked_tasks >= 1)     score += 1
  if (input.pending_ceo_approvals >= 1)  score += 1
  if (input.no_activity_hours >= 48)     score += 2
  else if (input.no_activity_hours >= 24) score += 1

  if (score >= 5) return 3
  if (score >= 3) return 2
  if (score >= 1) return 1
  return 0
}

// ─────────────────────────────────────────────────
// Async wrapper that fetches metrics + computes
// ─────────────────────────────────────────────────
export async function calculateSystemStatus(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<SystemRuntimeStatus> {
  const meta = await fetchSystemMetrics(supabase, userId, systemId)
  return computeStatus(meta)
}

export async function calculateSystemProgress(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<number> {
  const { completed, total } = await fetchTaskCounts(supabase, userId, systemId)
  return computeProgress({ completed_tasks: completed, total_tasks: total })
}

export async function calculateSystemRisk(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<SystemRiskLevel> {
  const m = await fetchSystemMetrics(supabase, userId, systemId)
  const since24h = Date.now() - 24 * HOUR
  const lastActivityAge = m.last_activity_at
    ? (Date.now() - new Date(m.last_activity_at).getTime()) / HOUR
    : 9999
  return computeRisk({
    failed_runs_24h: m.failed_runs_24h,
    blocked_tasks: m.open_tasks > 0 && m.runs_in_last_48h === 0 ? m.open_tasks : 0,
    pending_ceo_approvals: m.pending_ceo_approvals,
    no_activity_hours: lastActivityAge,
  })
}

// ─────────────────────────────────────────────────
// Full overview for Mission Control
// ─────────────────────────────────────────────────
export async function getSystemOverview(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<SystemOverview | null> {
  const { data: system } = await supabase.from('systems')
    .select('*').eq('id', systemId).eq('user_id', userId).single()
  if (!system) return null

  const m = await fetchSystemMetrics(supabase, userId, systemId)
  const { completed, total } = await fetchTaskCounts(supabase, userId, systemId)
  const status = computeStatus(m)
  const progress = computeProgress({ completed_tasks: completed, total_tasks: total })

  const lastActivityAge = m.last_activity_at
    ? (Date.now() - new Date(m.last_activity_at).getTime()) / HOUR
    : 9999
  const risk = computeRisk({
    failed_runs_24h: m.failed_runs_24h,
    blocked_tasks: m.open_tasks > 0 && m.runs_in_last_48h === 0 ? m.open_tasks : 0,
    pending_ceo_approvals: m.pending_ceo_approvals,
    no_activity_hours: lastActivityAge,
  })

  return {
    id: system.id as string, name: system.name as string,
    description: (system.description as string) ?? '',
    status: system.status as System['status'],
    runtime_status: status, risk_level: risk,
    progress_pct: progress,
    open_tasks: m.open_tasks, total_tasks: total,
    failed_runs_24h: m.failed_runs_24h,
    last_activity_at: m.last_activity_at,
    linked_projects: m.linked_projects,
    owner_manager: m.owner_manager,
  }
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
interface SystemMetrics {
  open_tasks: number
  failed_runs_24h: number
  runs_in_last_6h: number
  runs_in_last_48h: number
  last_activity_at: string | null
  pending_ceo_approvals: number
  linked_projects: SystemOverview['linked_projects']
  owner_manager: SystemOverview['owner_manager']
}

async function fetchSystemMetrics(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<SystemMetrics> {
  const { data: links } = await supabase.from('system_projects')
    .select('project_id, role').eq('user_id', userId).eq('system_id', systemId)

  const projectIds = (links ?? []).map(l => l.project_id as string)

  if (projectIds.length === 0) {
    return {
      open_tasks: 0, failed_runs_24h: 0, runs_in_last_6h: 0, runs_in_last_48h: 0,
      last_activity_at: null, pending_ceo_approvals: 0,
      linked_projects: [], owner_manager: null,
    }
  }

  const { data: projects } = await supabase.from('projects')
    .select('id, name, status, current_stage').in('id', projectIds)

  const { data: tasks } = await supabase.from('tasks')
    .select('id, workflow_status').in('project_id', projectIds)
  const taskIds = (tasks ?? []).map(t => t.id as string)
  const openTasks = (tasks ?? []).filter(t =>
    !['completed', 'approved', 'archived'].includes(String(t.workflow_status))
  ).length

  const since24h = new Date(Date.now() - 24 * HOUR).toISOString()
  const since48h = new Date(Date.now() - 48 * HOUR).toISOString()
  const since6h  = new Date(Date.now() -  6 * HOUR).toISOString()

  const { data: runs } = taskIds.length
    ? await supabase.from('task_runs')
        .select('run_status, started_at').in('task_id', taskIds)
        .gte('started_at', since48h).order('started_at', { ascending: false })
    : { data: [] }

  const failed_runs_24h = (runs ?? []).filter(r =>
    r.run_status === 'failed' && r.started_at && (r.started_at as string) >= since24h
  ).length
  const runs_in_last_6h = (runs ?? []).filter(r =>
    r.started_at && (r.started_at as string) >= since6h
  ).length
  const runs_in_last_48h = (runs ?? []).length
  const last_activity_at = (runs ?? [])[0]?.started_at as string | null ?? null

  // Pending CEO approvals across these projects
  const { count: pendingCeo } = await supabase.from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'pending').in('project_id', projectIds)
    .contains('required_approvers', ['ceo'])

  // Owner = primary manager of primary project (first ceo or eng manager)
  const primary = (links ?? []).find(l => l.role === 'primary')?.project_id as string | undefined
  let owner: SystemOverview['owner_manager'] = null
  if (primary) {
    const { data: m } = await supabase.from('managers')
      .select('id, role, name').eq('user_id', userId).eq('project_id', primary)
      .in('role', ['ceo', 'engineering_manager'] as ManagerRole[])
      .order('authority_level', { ascending: false }).limit(1).maybeSingle()
    if (m) owner = { id: m.id as string, role: m.role as string, name: m.name as string }
  }

  return {
    open_tasks: openTasks,
    failed_runs_24h,
    runs_in_last_6h,
    runs_in_last_48h,
    last_activity_at,
    pending_ceo_approvals: pendingCeo ?? 0,
    linked_projects: (projects ?? []).map(p => ({
      id: p.id as string, name: p.name as string,
      status: p.status as string,
      current_stage: (p.current_stage as number | null) ?? null,
    })),
    owner_manager: owner,
  }
}

async function fetchTaskCounts(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<{ completed: number; total: number }> {
  const { data: links } = await supabase.from('system_projects')
    .select('project_id').eq('user_id', userId).eq('system_id', systemId)
  const projectIds = (links ?? []).map(l => l.project_id as string)
  if (projectIds.length === 0) return { completed: 0, total: 0 }

  const { data: tasks } = await supabase.from('tasks')
    .select('workflow_status').in('project_id', projectIds)
  const total = (tasks ?? []).length
  const completed = (tasks ?? []).filter(t =>
    ['completed', 'approved'].includes(String(t.workflow_status))
  ).length
  return { completed, total }
}
