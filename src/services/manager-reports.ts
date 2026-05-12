import type { SupabaseClient } from '@supabase/supabase-js'
import type { ManagerReport, ManagerReportType } from '@/types'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.3 — Manager Reports V1
// Rule-based synthesis. LLM enrichment is opt-in (V2.4).
// Pure functions for deterministic tests; the DB wrapper at the
// bottom orchestrates input gathering + insert.
// ─────────────────────────────────────────────────

// ─────────────────────────────────────────
// Inputs (everything the synthesizer reads)
// ─────────────────────────────────────────
export interface ReportInputs {
  role: string                          // 'engineering_manager' | 'growth_manager' | ...
  report_type: ManagerReportType
  // Aggregates over the last reporting window:
  open_tasks: number
  blocked_tasks: number
  completed_tasks_7d: number
  failed_runs_24h: number
  failed_runs_7d: number
  pending_approvals: number
  pending_ceo_approvals: number
  // Project / system anchors
  project_name?: string
  system_name?: string
  // Domain-specific signals
  growth_running?: number
  growth_completed_7d?: number
  destructive_actions_24h?: number
  hours_since_last_activity?: number
  // Optional context for richer summary
  recent_decisions_count?: number
  recent_failed_actions?: string[]      // e.g. ['github.pr.create', 'supabase.migration.apply_staging']
  // V2.9 — Workflow Runtime signals
  active_workflows_count?: number
  blocked_workflows_count?: number      // status === 'blocked_approval'
  failed_workflows_count?: number       // status === 'failed'
  active_workflows?: Array<{
    workflow_id: string
    workflow_name: string
    workflow_category?: string         // 'growth' | 'product' | 'content' | 'governance' | 'research'
    run_id: string
    run_status: string                 // running | blocked_approval | failed
    bottleneck_step_key: string | null
    next_action?: string | null
    owner?: string | null
    failed_step_count: number
  }>
}

// ─────────────────────────────────────────
// Output shape (V2.9 — adds workflow surface)
// ─────────────────────────────────────────
export interface SynthesizedReport {
  title: string
  summary: string
  blockers: string[]
  risks: string[]
  next_actions: string[]
  confidence_score: number              // 0-1
  needs_user_intervention: boolean
  metrics: Record<string, unknown>
  // V2.9 — workflow runtime fields surfaced separately for UI cards
  active_workflows_count: number
  blocked_workflows_count: number
  bottleneck_step?: string | null       // workflow_name → step_key
  owner_or_execution_unit?: string | null
  next_workflow_action?: string | null
}

// ─────────────────────────────────────────
// Role → label
// ─────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  ceo:                 'CEO',
  engineering_manager: 'CTO',
  finance_manager:     'COO',
  design_manager:      'CPO',
  qa_manager:          'QA',
  growth_manager:      'CGO',
  risk_manager:        'CSO',
}

// ─────────────────────────────────────────
// Pure synthesizer — deterministic, fully testable
// ─────────────────────────────────────────
export function synthesizeReport(input: ReportInputs): SynthesizedReport {
  const label = ROLE_LABEL[input.role] ?? input.role
  const blockers: string[] = []
  const risks: string[] = []
  const next_actions: string[] = []
  let needs_user_intervention = false
  let confidence = 0.7

  // ── Universal signals ──
  if (input.failed_runs_24h >= 3) {
    risks.push(`24h 内 ${input.failed_runs_24h} 次执行失败 — 需排查根因`)
    confidence -= 0.1
  }
  if (input.pending_ceo_approvals > 0) {
    blockers.push(`${input.pending_ceo_approvals} 项待 CEO 审批，阻塞执行链`)
    needs_user_intervention = true
  }
  if (input.blocked_tasks > 0) {
    blockers.push(`${input.blocked_tasks} 个任务被阻塞（开放但 48h 无活动）`)
  }
  if ((input.hours_since_last_activity ?? 0) >= 72) {
    risks.push(`已 ${Math.floor((input.hours_since_last_activity ?? 0) / 24)} 天没有任何执行活动`)
  }

  // ── Role-specific signals ──
  switch (input.role) {
    case 'engineering_manager': {
      // CTO
      if ((input.destructive_actions_24h ?? 0) > 0) {
        risks.push('检测到破坏性 SQL 或合并主分支动作 — 需复核')
        needs_user_intervention = true
      }
      if (input.failed_runs_7d >= 5) {
        next_actions.push('回顾 task_runs 失败聚类，找出共因 (npm test 是否变 flaky?)')
      }
      if (input.open_tasks > 0 && input.completed_tasks_7d === 0) {
        risks.push('本周无任务完成 — 工程节奏停滞')
      } else if (input.completed_tasks_7d > 0) {
        next_actions.push(`继续推进剩余 ${input.open_tasks} 个开放工程任务`)
      }
      break
    }

    case 'qa_manager': {
      if (input.failed_runs_7d >= 3) {
        risks.push(`本周 ${input.failed_runs_7d} 次失败 — QA 应介入审查`)
      }
      if ((input.recent_failed_actions ?? []).some(a => a.includes('migration'))) {
        risks.push('迁移类失败 — 需补充验证 SQL')
        needs_user_intervention = true
      }
      next_actions.push('对最近失败的执行做事故复盘 + 添加回归用例')
      break
    }

    case 'growth_manager': {
      if ((input.growth_running ?? 0) === 0 && (input.growth_completed_7d ?? 0) === 0) {
        blockers.push('增长循环停滞 — 没有 running 实验也没有刚完成的实验')
        next_actions.push('启动至少 1 个 running 实验（建议从冷邮件 / 内容渠道开始）')
        confidence -= 0.15
      } else if ((input.growth_running ?? 0) > 0) {
        next_actions.push(`继续跟进 ${input.growth_running} 个 running 实验，关注转化指标`)
      }
      if ((input.growth_completed_7d ?? 0) > 0) {
        next_actions.push(`复盘 ${input.growth_completed_7d} 个本周完成的实验，决定是否放大或停掉`)
      }
      break
    }

    case 'design_manager': {
      // CPO
      if (input.open_tasks > 5) {
        risks.push('开放任务堆积 — 是否有产品需求模糊？')
      }
      next_actions.push('回顾本周用户反馈与产品反馈，更新 backlog 优先级')
      break
    }

    case 'finance_manager': {
      // COO
      next_actions.push(`本周完成率 ${input.open_tasks === 0 ? '100%' : Math.round(input.completed_tasks_7d / Math.max(1, input.completed_tasks_7d + input.open_tasks) * 100) + '%'}`)
      if (input.blocked_tasks > 0) {
        next_actions.push('排掉阻塞项；如需决策升级到 CEO')
      }
      break
    }

    case 'risk_manager': {
      // CSO
      if (input.failed_runs_24h > 0) {
        risks.push('系统当前不健康 — 24h 内有失败')
      }
      if (input.pending_ceo_approvals > 0) {
        risks.push(`${input.pending_ceo_approvals} 项 CEO 待批 — 决策延迟即风险`)
      }
      if (risks.length === 0) risks.push('无高优风险。继续监控。')
      break
    }

    case 'ceo': {
      // The CEO summary is meta — synthesize across other roles' aggregates
      next_actions.push('查看 Approvals 队列做关键决策')
      if (input.pending_ceo_approvals > 0) needs_user_intervention = true
      if (input.blocked_tasks === 0 && input.failed_runs_24h === 0)
        next_actions.push('系统运转正常 — 关注 Growth 与 Strategic 长线')
      break
    }
  }

  // ── V2.9: Workflow Runtime overlay ──
  // Each role focuses on a different slice of active workflow runs.
  const wfOverlay = applyWorkflowOverlay(input, blockers, risks, next_actions)
  if (wfOverlay.needs_intervention) needs_user_intervention = true

  // ── Default safety nets ──
  if (next_actions.length === 0) {
    next_actions.push('维持当前执行节奏；下个循环再汇报')
  }
  if (risks.length === 0 && blockers.length === 0) {
    risks.push('无显著风险')
  }

  const summary = buildSummary(label, input, blockers, next_actions)
  const title   = buildTitle(label, input.report_type, input)

  // Confidence bounds
  if (confidence < 0.2) confidence = 0.2
  if (confidence > 0.95) confidence = 0.95
  if (blockers.length === 0 && risks.length <= 1 && input.failed_runs_24h === 0) {
    confidence = Math.min(0.9, confidence + 0.1)
  }

  return {
    title,
    summary,
    blockers,
    risks,
    next_actions,
    confidence_score: Number(confidence.toFixed(2)),
    needs_user_intervention,
    metrics: {
      open_tasks: input.open_tasks,
      blocked_tasks: input.blocked_tasks,
      completed_tasks_7d: input.completed_tasks_7d,
      failed_runs_24h: input.failed_runs_24h,
      pending_approvals: input.pending_approvals,
      growth_running: input.growth_running ?? 0,
      active_workflows: input.active_workflows_count ?? 0,
      blocked_workflows: input.blocked_workflows_count ?? 0,
      bottleneck_step: wfOverlay.bottleneck_step,
      next_workflow_action: wfOverlay.next_workflow_action,
      owner_or_execution_unit: wfOverlay.owner,
    },
    active_workflows_count: input.active_workflows_count ?? 0,
    blocked_workflows_count: input.blocked_workflows_count ?? 0,
    bottleneck_step: wfOverlay.bottleneck_step,
    owner_or_execution_unit: wfOverlay.owner,
    next_workflow_action: wfOverlay.next_workflow_action,
  }
}

// ─────────────────────────────────────────────────
// V2.9 — Workflow overlay for synthesizeReport.
// Pure: given the input + mutable arrays from caller, mutates them
// in place to add workflow-derived blockers / risks / next_actions.
// Returns the headline workflow facts that get attached to the output.
// ─────────────────────────────────────────────────
interface WorkflowOverlayResult {
  needs_intervention: boolean
  bottleneck_step: string | null
  owner: string | null
  next_workflow_action: string | null
}

function applyWorkflowOverlay(
  input: ReportInputs,
  blockers: string[], risks: string[], next_actions: string[],
): WorkflowOverlayResult {
  const all = input.active_workflows ?? []
  if (all.length === 0) {
    return { needs_intervention: false, bottleneck_step: null, owner: null, next_workflow_action: null }
  }

  // Which workflows does THIS role care about?
  const filtered = filterWorkflowsForRole(input.role, all)
  // Each role still cares about CEO-blocked gates universally — surface them.
  const ceoBlocked = all.filter(w => w.run_status === 'blocked_approval')

  const failed = filtered.filter(w => w.run_status === 'failed')
  const blockedApproval = filtered.filter(w => w.run_status === 'blocked_approval')
  const running = filtered.filter(w => w.run_status === 'running')

  // Risk / blocker copy by role
  if (failed.length > 0) {
    for (const w of failed.slice(0, 2)) {
      blockers.push(`Workflow "${w.workflow_name}" 失败于 ${w.bottleneck_step_key ?? '(?)'}`)
    }
  }
  if (blockedApproval.length > 0) {
    for (const w of blockedApproval.slice(0, 2)) {
      blockers.push(`Workflow "${w.workflow_name}" 阻塞在 ${w.bottleneck_step_key ?? '审批 gate'}`)
    }
  }
  if (running.length > 0 && filtered.length > 0) {
    next_actions.push(
      `跟进 ${running.length} 个 ${roleScopeLabel(input.role)} workflow，当前步骤：${
        running.map(w => `${w.workflow_name}→${w.bottleneck_step_key ?? '?'}`).join('；')
      }`,
    )
  }

  // CEO sees the union, plus governance focus on gates
  let needs_intervention = false
  if (input.role === 'ceo') {
    if (ceoBlocked.length > 0) {
      needs_intervention = true
      next_actions.unshift(`处理 ${ceoBlocked.length} 个 workflow 审批 gate`)
    }
    // Resource conflict heuristic: ≥3 workflows running on same project
    if (running.length >= 3) {
      risks.push(`同时运行 ${running.length} 个 workflow — 资源可能冲突`)
    }
  }

  // CSO: blocked_approval is a queue risk
  if (input.role === 'risk_manager' && blockedApproval.length > 0) {
    risks.push(`${blockedApproval.length} 个 workflow 卡在审批 gate — 决策延迟即风险`)
  }

  const headline = blockedApproval[0] ?? failed[0] ?? running[0] ?? filtered[0]
  return {
    needs_intervention,
    bottleneck_step: headline
      ? `${headline.workflow_name}→${headline.bottleneck_step_key ?? '(?)'}`
      : null,
    owner: headline?.owner ?? null,
    next_workflow_action: headline?.next_action
      ?? (headline?.bottleneck_step_key ? `推进步骤 ${headline.bottleneck_step_key}` : null),
  }
}

function filterWorkflowsForRole(
  role: string,
  all: NonNullable<ReportInputs['active_workflows']>,
): NonNullable<ReportInputs['active_workflows']> {
  switch (role) {
    case 'engineering_manager':                          // CTO: product / coding-flavored
      return all.filter(w => ['product','research'].includes(w.workflow_category ?? ''))
    case 'design_manager':                               // CPO: product
      return all.filter(w => w.workflow_category === 'product')
    case 'growth_manager':                               // CGO: growth + content
      return all.filter(w => ['growth','content'].includes(w.workflow_category ?? ''))
    case 'qa_manager':                                   // QA: product (QA gates) + governance
      return all.filter(w => ['product','governance'].includes(w.workflow_category ?? ''))
    case 'finance_manager':                              // COO: all workflows (operating view)
      return all
    case 'risk_manager':                                 // CSO: all (risk surface)
      return all
    case 'ceo':                                          // CEO: all (top-level)
      return all
    default:
      return all
  }
}

function roleScopeLabel(role: string): string {
  switch (role) {
    case 'engineering_manager': return '技术'
    case 'design_manager':      return '产品'
    case 'growth_manager':      return '增长'
    case 'qa_manager':          return 'QA'
    case 'finance_manager':     return '运营'
    case 'risk_manager':        return '风险'
    case 'ceo':                 return ''
    default:                    return ''
  }
}

function buildTitle(label: string, type: ManagerReportType, input: ReportInputs): string {
  const date = new Date().toISOString().slice(5, 10)  // MM-DD
  const scope = input.project_name ?? input.system_name
  const scopeStr = scope ? ` · ${scope}` : ''
  return `${label} · ${type}${scopeStr} (${date})`
}

function buildSummary(
  label: string, input: ReportInputs,
  blockers: string[], next_actions: string[],
): string {
  const lines: string[] = []
  lines.push(`${label} 当前判断：`)
  if (blockers.length === 0 && input.failed_runs_24h === 0) {
    lines.push(`系统运转正常。开放任务 ${input.open_tasks} · 本周完成 ${input.completed_tasks_7d}。`)
  } else {
    lines.push(`存在 ${blockers.length} 项阻塞、24h 失败 ${input.failed_runs_24h} 次。`)
  }
  if (input.pending_ceo_approvals > 0) {
    lines.push(`CEO 待批 ${input.pending_ceo_approvals} 项 — 处理后多数动作可继续。`)
  }
  lines.push(`下一步：${next_actions.slice(0, 2).join('；')}。`)
  return lines.join(' ')
}

// ─────────────────────────────────────────
// Input gatherer — reads the DB
// ─────────────────────────────────────────
export async function gatherReportInputs(
  supabase: SupabaseClient, userId: string,
  args: { role: string; report_type: ManagerReportType; project_id?: string; system_id?: string; execution_unit_id?: string },
): Promise<ReportInputs> {
  const HOUR = 60 * 60 * 1000
  const since24h = new Date(Date.now() - 24 * HOUR).toISOString()
  const since48h = new Date(Date.now() - 48 * HOUR).toISOString()
  const since7d  = new Date(Date.now() -  7 * 24 * HOUR).toISOString()

  // Resolve project filter set
  let projectIds: string[] | null = null
  if (args.project_id) {
    projectIds = [args.project_id]
  } else if (args.system_id) {
    const { data: links } = await supabase.from('system_projects')
      .select('project_id').eq('user_id', userId).eq('system_id', args.system_id)
    projectIds = (links ?? []).map(l => l.project_id as string)
  }

  // Tasks
  let tasksQ = supabase.from('tasks').select('id, workflow_status, updated_at, project_id')
    .eq('user_id', userId)
  if (projectIds && projectIds.length > 0) tasksQ = tasksQ.in('project_id', projectIds)
  const { data: tasks } = await tasksQ
  const open = (tasks ?? []).filter(t => !['completed', 'approved', 'archived'].includes(String(t.workflow_status))).length
  const completed_7d = (tasks ?? []).filter(t =>
    ['completed', 'approved'].includes(String(t.workflow_status)) &&
    (t.updated_at as string) >= since7d
  ).length

  // Task runs
  const taskIds = (tasks ?? []).map(t => t.id as string)
  const { data: runs } = taskIds.length
    ? await supabase.from('task_runs')
        .select('run_status, started_at').in('task_id', taskIds).gte('started_at', since7d)
        .order('started_at', { ascending: false })
    : { data: [] }
  const failed_24h = (runs ?? []).filter(r => r.run_status === 'failed' && (r.started_at as string) >= since24h).length
  const failed_7d  = (runs ?? []).filter(r => r.run_status === 'failed').length
  const last_activity = (runs ?? [])[0]?.started_at as string | undefined
  const hours_since_last_activity = last_activity
    ? Math.round((Date.now() - new Date(last_activity).getTime()) / HOUR)
    : 9999

  // Approval queue
  let approvalsQ = supabase.from('approval_requests')
    .select('id, required_approvers').eq('user_id', userId).eq('status', 'pending')
  if (projectIds && projectIds.length > 0) approvalsQ = approvalsQ.in('project_id', projectIds)
  const { data: approvals } = await approvalsQ
  const pending_approvals = (approvals ?? []).length
  const pending_ceo_approvals = (approvals ?? []).filter(a =>
    Array.isArray(a.required_approvers) && (a.required_approvers as string[]).includes('ceo')
  ).length

  // Blocked tasks (open + 48h no activity)
  const blocked_tasks = (tasks ?? []).filter(t => {
    if (['completed', 'approved', 'archived'].includes(String(t.workflow_status))) return false
    return ((t.updated_at as string | null) ?? '') < since48h
  }).length

  // Tool failures
  const { data: toolFailures } = await supabase.from('tool_runs')
    .select('action').eq('user_id', userId).eq('status', 'error').gte('started_at', since24h)
    .order('started_at', { ascending: false }).limit(10)
  const recent_failed_actions = (toolFailures ?? []).map(t => t.action as string)

  // Destructive actions (L4 escalations)
  const { count: destructive_actions_24h } = await supabase.from('tool_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('started_at', since24h).gte('risk_level', 4)

  // Growth signals
  const { data: growthExps } = await supabase.from('growth_experiments')
    .select('status, updated_at').eq('user_id', userId)
  const growth_running = (growthExps ?? []).filter(e => e.status === 'running').length
  const growth_completed_7d = (growthExps ?? []).filter(e =>
    e.status === 'completed' && (e.updated_at as string) >= since7d).length

  // Recent decisions count
  const { count: recent_decisions_count } = await supabase.from('decision_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', since7d)

  // ─── V2.9 — Workflow runtime signals ───────────────────────
  let activeWorkflowsQ = supabase.from('workflow_runs')
    .select('id, status, bottleneck_step_key, workflow_id, project_id, owner_unit_id')
    .eq('user_id', userId)
    .in('status', ['running','blocked_approval','pending','failed'])
  if (projectIds && projectIds.length > 0) activeWorkflowsQ = activeWorkflowsQ.in('project_id', projectIds)
  const { data: wfRuns } = await activeWorkflowsQ

  const activeRuns = (wfRuns ?? []).filter(r => r.status !== 'failed')
  const failedRuns = (wfRuns ?? []).filter(r => r.status === 'failed')
  const blockedRuns = (wfRuns ?? []).filter(r => r.status === 'blocked_approval')

  const active_workflows: ReportInputs['active_workflows'] = []
  if ((wfRuns ?? []).length > 0) {
    const wfIds = [...new Set((wfRuns ?? []).map(r => r.workflow_id as string))]
    const ownerIds = [...new Set((wfRuns ?? []).map(r => r.owner_unit_id as string | null).filter(Boolean) as string[])]

    const [{ data: wfs }, { data: units }] = await Promise.all([
      supabase.from('workflows').select('id, name, metadata').in('id', wfIds),
      ownerIds.length
        ? supabase.from('execution_units').select('id, name, avatar').in('id', ownerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; avatar: string }> }),
    ])
    const wfMap = new Map((wfs ?? []).map(w => [
      w.id as string,
      {
        name: w.name as string,
        category: (w.metadata as Record<string, unknown> | null)?.category as string | undefined,
      },
    ]))
    const ownerMap = new Map(
      ((units ?? []) as Array<{ id: string; name: string; avatar: string }>)
        .map(u => [u.id, `${u.avatar ?? '🤖'} ${u.name}`]),
    )

    // Try to derive workflow category from template id stored in metadata
    // (set on creation). Fallback to 'product' if missing.
    for (const r of (wfRuns ?? [])) {
      const wf = wfMap.get(r.workflow_id as string)
      const meta = (wfs ?? []).find(w => w.id === r.workflow_id)?.metadata as Record<string, unknown> | null
      const templateId = (meta?.template_id as string) ?? ''
      let category: string | undefined = wf?.category
      if (!category && templateId) {
        if (templateId.includes('content'))         category = 'content'
        else if (templateId.includes('launch'))     category = 'growth'
        else if (templateId.includes('customer'))   category = 'growth'
        else if (templateId.includes('product'))    category = 'product'
        else if (templateId.includes('ceo'))        category = 'governance'
      }
      // Step-run lookup for failed step count + next_action heuristic
      const { data: stepRuns } = await supabase.from('workflow_step_runs')
        .select('status, step_key')
        .eq('user_id', userId).eq('workflow_run_id', r.id)
      const failed_step_count = (stepRuns ?? []).filter(s => s.status === 'failed' || s.status === 'escalated').length
      const nextActionFrom = (stepRuns ?? []).find(s => s.status === 'ready' || s.status === 'blocked_approval')
      const nextAction = nextActionFrom
        ? (nextActionFrom.status === 'blocked_approval'
            ? `approve ${nextActionFrom.step_key} gate`
            : `dispatch ${nextActionFrom.step_key}`)
        : (r.bottleneck_step_key ? `推进 ${r.bottleneck_step_key}` : null)

      active_workflows.push({
        workflow_id: r.workflow_id as string,
        workflow_name: wf?.name ?? '(workflow)',
        workflow_category: category,
        run_id: r.id as string,
        run_status: r.status as string,
        bottleneck_step_key: (r.bottleneck_step_key as string | null) ?? null,
        next_action: nextAction,
        owner: r.owner_unit_id ? ownerMap.get(r.owner_unit_id as string) ?? null : null,
        failed_step_count,
      })
    }
  }

  // Names for title
  let project_name: string | undefined
  let system_name: string | undefined
  if (args.project_id) {
    const { data: p } = await supabase.from('projects').select('name').eq('id', args.project_id).maybeSingle()
    project_name = (p?.name as string) ?? undefined
  }
  if (args.system_id) {
    const { data: s } = await supabase.from('systems').select('name').eq('id', args.system_id).maybeSingle()
    system_name = (s?.name as string) ?? undefined
  }

  return {
    role: args.role,
    report_type: args.report_type,
    open_tasks: open,
    blocked_tasks,
    completed_tasks_7d: completed_7d,
    failed_runs_24h: failed_24h,
    failed_runs_7d: failed_7d,
    pending_approvals,
    pending_ceo_approvals,
    growth_running,
    growth_completed_7d,
    destructive_actions_24h: destructive_actions_24h ?? 0,
    hours_since_last_activity,
    recent_decisions_count: recent_decisions_count ?? 0,
    recent_failed_actions,
    project_name,
    system_name,
    active_workflows_count: activeRuns.length,
    blocked_workflows_count: blockedRuns.length,
    failed_workflows_count: failedRuns.length,
    active_workflows,
  }
}

// ─────────────────────────────────────────
// Generate + persist
// ─────────────────────────────────────────
export async function generateManagerReport(
  supabase: SupabaseClient, userId: string,
  args: {
    role: string;
    report_type: ManagerReportType;
    project_id?: string;
    system_id?: string;
    execution_unit_id?: string;
  },
): Promise<ManagerReport | null> {
  const inputs = await gatherReportInputs(supabase, userId, args)
  const synth  = synthesizeReport(inputs)

  // Try to find a manager_id matching this role + scope
  let manager_id: string | null = null
  if (args.project_id) {
    const { data: m } = await supabase.from('managers')
      .select('id').eq('user_id', userId).eq('project_id', args.project_id).eq('role', args.role).maybeSingle()
    manager_id = (m?.id as string) ?? null
  }

  const { data, error } = await supabase.from('manager_reports').insert({
    user_id:  userId,
    manager_id,
    project_id: args.project_id ?? null,
    system_id:  args.system_id ?? null,
    execution_unit_id: args.execution_unit_id ?? null,
    role: args.role,
    report_period: args.report_type === 'weekly' ? 'weekly' : (args.report_type === 'daily' ? 'daily' : 'on_demand'),
    report_type: args.report_type,
    title: synth.title,
    summary: synth.summary,
    blockers: synth.blockers,
    risks: synth.risks,
    next_actions: synth.next_actions,
    confidence_score: synth.confidence_score,
    needs_user_intervention: synth.needs_user_intervention,
    metrics: synth.metrics,
    source: 'rule_based',
  }).select().single()

  if (error || !data) {
    logger.warn('manager_report.generate_fail', { error_message: error?.message, role: args.role })
    return null
  }
  return data as ManagerReport
}

// ─────────────────────────────────────────
// Helpers used by Copilot
// ─────────────────────────────────────────
export async function listManagerReports(
  supabase: SupabaseClient, userId: string,
  filter: { role?: string; report_type?: ManagerReportType; only_blocked?: boolean; limit?: number } = {},
): Promise<ManagerReport[]> {
  let q = supabase.from('manager_reports').select('*').eq('user_id', userId)
    .order('generated_at', { ascending: false })
  if (filter.role)        q = q.eq('role', filter.role)
  if (filter.report_type) q = q.eq('report_type', filter.report_type)
  if (filter.only_blocked) q = q.gt('needs_user_intervention', false)
  q = q.limit(filter.limit ?? 20)
  const { data } = await q
  return (data ?? []) as ManagerReport[]
}

export async function markReportRead(
  supabase: SupabaseClient, userId: string, reportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('manager_reports')
    .update({ read_at: new Date().toISOString() })
    .eq('id', reportId).eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
