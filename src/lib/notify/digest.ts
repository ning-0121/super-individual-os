// ─────────────────────────────────────────────────
// V3.3 — Daily digest (pure)
// Turns the same signals as the "today radar" into a short message that gets
// pushed to the owner once a day, so the OS comes to them rather than the
// other way around. No DB, no time-now side effects — fully testable.
// ─────────────────────────────────────────────────

export interface DigestInput {
  date_label: string                 // e.g. '2026-05-13'
  pending_approvals: number
  blocked_workflows: number
  failed_runs_24h: number
  manager_interventions: number      // reports flagged needs_user_intervention
  today_cost_usd: number
  reports_generated_today: number
  budget_critical?: boolean          // cost hard-cap tripped
}

export type DigestSeverity = 'calm' | 'attention' | 'urgent'

export interface DailyDigest {
  severity: DigestSeverity
  title: string
  lines: string[]
  text: string       // plain text (email / logs)
  markdown: string   // Slack / Discord / Telegram-friendly
}

// urgent  : something needs a human now (failures, blocked work, escalations, budget blown)
// attention: pending approvals waiting, but nothing on fire
// calm    : nothing requires the human
export function classifyDigestSeverity(i: DigestInput): DigestSeverity {
  if (i.failed_runs_24h > 0 || i.blocked_workflows > 0 ||
      i.manager_interventions > 0 || i.budget_critical) {
    return 'urgent'
  }
  if (i.pending_approvals > 0) return 'attention'
  return 'calm'
}

const SEVERITY_EMOJI: Record<DigestSeverity, string> = {
  calm: '🟢', attention: '🟡', urgent: '🔴',
}

function fmtUsd(usd: number): string {
  if (!usd || usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function buildDailyDigest(i: DigestInput): DailyDigest {
  const severity = classifyDigestSeverity(i)
  const emoji = SEVERITY_EMOJI[severity]

  const title = severity === 'calm'
    ? `${emoji} ${i.date_label} · 一切平稳，无需你出手`
    : severity === 'attention'
      ? `${emoji} ${i.date_label} · ${i.pending_approvals} 项待你审批`
      : `${emoji} ${i.date_label} · 有事项需要你处理`

  const lines: string[] = []

  // Action items first (the "so what")
  if (i.manager_interventions > 0) {
    lines.push(`⚠️ ${i.manager_interventions} 份经理报告标记「需你介入」`)
  }
  if (i.blocked_workflows > 0) {
    lines.push(`🚧 ${i.blocked_workflows} 个 workflow 卡在审批，自治环推不动`)
  }
  if (i.failed_runs_24h > 0) {
    lines.push(`❌ 过去 24h 有 ${i.failed_runs_24h} 次执行失败`)
  }
  if (i.pending_approvals > 0) {
    lines.push(`🛡 ${i.pending_approvals} 项待审批`)
  }
  if (i.budget_critical) {
    lines.push(`💸 成本已触顶 — 模型调用已被硬上限拦截`)
  }
  if (lines.length === 0) {
    lines.push('✅ 没有待办、没有阻塞、没有失败。经理们已自动巡检。')
  }

  // Always-present footer stats
  lines.push(`— 今日 AI 成本 ${fmtUsd(i.today_cost_usd)} · 自动生成 ${i.reports_generated_today} 份日报`)

  const text = [title, '', ...lines].join('\n')
  const markdown = [`*${title}*`, '', ...lines.map(l => `• ${l}`)].join('\n')

  return { severity, title, lines, text, markdown }
}

// True when "now" falls in the configured send hour (UTC). On an hourly cron
// this fires exactly once per day; documented as UTC for predictability.
export function shouldSendDigestNow(now: Date, targetHourUtc: number): boolean {
  const h = Number.isFinite(targetHourUtc) ? Math.max(0, Math.min(23, Math.trunc(targetHourUtc))) : 8
  return now.getUTCHours() === h
}
