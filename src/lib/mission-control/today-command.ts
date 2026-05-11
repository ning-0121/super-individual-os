// ─────────────────────────────────────────────────
// V2.7 — Mission Control "Today Command" prioritizer (pure)
// Picks the single most important thing the user should look at right now,
// from a pool of signals. Deterministic — fully testable.
// ─────────────────────────────────────────────────

export interface TodayInputs {
  // From approval_requests
  ceo_pending_count: number
  critical_pending_count: number
  high_pending_count: number
  recent_pending_title?: string | null
  recent_pending_id?: string | null
  recent_pending_risk_label?: 'low' | 'medium' | 'high' | 'critical' | null

  // From manager_reports (V2.3+)
  manager_intervention_count: number
  manager_intervention_role?: string | null
  manager_intervention_summary?: string | null
  manager_intervention_project_id?: string | null

  // From project_contexts + health (V2.5+)
  critical_project_id?: string | null
  critical_project_name?: string | null
  critical_project_blockers?: number
  critical_project_next_action?: string | null

  // From locked project (the most recently-locked one)
  locked_project_id?: string | null
  locked_project_name?: string | null
  locked_project_focus?: string | null
  locked_project_next_action?: string | null

  // Failed runs / tool_runs (24h)
  failed_runs_24h: number

  // Top open MUST task across the user (any project)
  top_open_must_task_title?: string | null
}

// Reasons used by the UI to colour the hero card.
export type TodayPriorityKind =
  | 'ceo_approval'        // critical / high approval pending
  | 'critical_project'    // a project is in critical health
  | 'manager_help'        // a manager report flagged needs_user_intervention
  | 'failed_runs'         // 5+ failed tool runs in 24h
  | 'focus_action'        // locked project's next action
  | 'top_must_task'       // user has a MUST task pending
  | 'idle'                // system idle — nothing pressing

export type SuggestionTone = 'critical' | 'warning' | 'neutral' | 'positive'

export interface TodayCommand {
  // Hero
  kind: TodayPriorityKind
  tone: SuggestionTone
  headline: string            // "今天最重要的事"
  detail: string              // single sentence

  // Top risk
  top_risk: string

  // CTA
  primary_cta_label: string
  primary_cta_href: string

  // Counters for the "需要你处理" stat
  user_action_count: number   // ceo_pending + manager_intervention + critical_project (if any)

  // Free-form "AI 建议下一步"
  suggested_next: string
}

// ─────────────────────────────────────────────────
// First-match wins. The first signal to fire becomes the headline.
// Ordering reflects user attention priority.
// ─────────────────────────────────────────────────
export function pickTodayCommand(input: TodayInputs): TodayCommand {
  const user_action_count =
    input.ceo_pending_count +
    input.manager_intervention_count +
    (input.critical_project_id ? 1 : 0)

  // 1. CEO approval queue — top priority always
  if (input.critical_pending_count > 0 || input.ceo_pending_count > 0) {
    const lbl = input.recent_pending_risk_label
    const tone: SuggestionTone =
      input.critical_pending_count > 0 || lbl === 'critical' ? 'critical' : 'warning'
    return {
      kind: 'ceo_approval', tone,
      headline: input.critical_pending_count > 0
        ? `${input.critical_pending_count} 个 critical 审批等你决策`
        : `${input.ceo_pending_count} 个 CEO 审批待处理`,
      detail: input.recent_pending_title
        ? `最近：${input.recent_pending_title}`
        : '请进入审批中心处理高风险事项',
      top_risk: '决策延迟会阻塞下游执行',
      primary_cta_label: '打开审批中心',
      primary_cta_href: '/approvals',
      user_action_count,
      suggested_next:
        '先把 critical/CEO 审批清掉 → 再看 Manager Briefings → 再处理任务',
    }
  }

  // 2. Critical project — biggest single-project risk
  if (input.critical_project_id) {
    return {
      kind: 'critical_project', tone: 'critical',
      headline: `${input.critical_project_name ?? '项目'} 处于 critical 状态`,
      detail: input.critical_project_next_action
        ? `下一步：${input.critical_project_next_action}`
        : '该项目阻塞或长时间无活动 — 需要你介入',
      top_risk: input.critical_project_blockers
        ? `${input.critical_project_blockers} 项阻塞未解`
        : '健康度极低',
      primary_cta_label: '进入项目',
      primary_cta_href: `/projects/${input.critical_project_id}`,
      user_action_count,
      suggested_next:
        '进项目页 → 点 Generate Handoff 看完整诊断 → 决定 Stop/Pivot/Continue',
    }
  }

  // 3. Manager intervention — AI 经理喊救命
  if (input.manager_intervention_count > 0) {
    const projectHref = input.manager_intervention_project_id
      ? `/projects/${input.manager_intervention_project_id}`
      : '/mission-control'
    return {
      kind: 'manager_help', tone: 'warning',
      headline: `${input.manager_intervention_role ?? '某位经理'} 需要你介入`,
      detail: input.manager_intervention_summary?.slice(0, 140)
        ?? '查看 Manager Briefings 了解详情',
      top_risk: input.manager_intervention_count > 1
        ? `共 ${input.manager_intervention_count} 个经理需介入`
        : 'AI 经理已尽力但卡住',
      primary_cta_label: '看经理简报',
      primary_cta_href: projectHref,
      user_action_count,
      suggested_next: '读经理报告 → 决定是否调整方向 / 增加资源',
    }
  }

  // 4. High-risk approvals (no CEO needed but still important)
  if (input.high_pending_count > 0) {
    return {
      kind: 'ceo_approval', tone: 'warning',
      headline: `${input.high_pending_count} 个 high-risk 审批待处理`,
      detail: input.recent_pending_title ?? '请尽快处理',
      top_risk: '延迟可能阻塞执行链',
      primary_cta_label: '打开审批中心',
      primary_cta_href: '/approvals',
      user_action_count,
      suggested_next: '清完 high-risk → 让所有经理汇报一次',
    }
  }

  // 5. Failed runs spike
  if (input.failed_runs_24h >= 5) {
    return {
      kind: 'failed_runs', tone: 'warning',
      headline: `过去 24h 有 ${input.failed_runs_24h} 次执行失败`,
      detail: '可能是配置 / 工具集成异常 — 建议先排查根因',
      top_risk: '失败聚类可能掩盖更深的系统问题',
      primary_cta_label: '查看 Tool Autonomy',
      primary_cta_href: '/tools/autonomy',
      user_action_count,
      suggested_next: '看失败 tool_runs 聚类 → 修配置或暂停相关 agent',
    }
  }

  // 6. Locked project focus action — happy path: drive the focus
  if (input.locked_project_id && input.locked_project_next_action) {
    return {
      kind: 'focus_action', tone: 'positive',
      headline: `继续推进：${input.locked_project_focus ?? input.locked_project_name ?? ''}`,
      detail: `下一步：${input.locked_project_next_action}`,
      top_risk: '无显著风险',
      primary_cta_label: '进入项目',
      primary_cta_href: `/projects/${input.locked_project_id}`,
      user_action_count,
      suggested_next: '完成 next action → 让 CTO/CGO 出一份每日简报',
    }
  }

  // 7. Top MUST task
  if (input.top_open_must_task_title) {
    return {
      kind: 'top_must_task', tone: 'neutral',
      headline: `优先任务：${input.top_open_must_task_title.slice(0, 80)}`,
      detail: '这是当前优先级最高的开放任务',
      top_risk: '无显著风险',
      primary_cta_label: '前往任务面板',
      primary_cta_href: '/tasks',
      user_action_count,
      suggested_next: '完成后回到 Mission Control 查看下一步',
    }
  }

  // 8. Idle
  return {
    kind: 'idle', tone: 'positive',
    headline: '系统运转正常，今天可以专注做长线',
    detail: '没有 CEO 待批 / 经理求救 / critical 项目 / 高失败率',
    top_risk: '无显著风险',
    primary_cta_label: '看增长实验',
    primary_cta_href: '/growth',
    user_action_count,
    suggested_next: '推进 Growth 实验 / 复盘上周 / 写下一步战略',
  }
}
