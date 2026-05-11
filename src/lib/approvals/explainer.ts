import type { RiskLabel } from './risk'

// ─────────────────────────────────────────────────
// V2.4 — Approval Explainer (pure)
// Generates a structured "why approval is needed" card per request.
// Rule-based first; LLM enrichment is opt-in (V2.5).
// ─────────────────────────────────────────────────

export interface ExplainInput {
  action_type: string
  risk_label: RiskLabel
  title?: string
  description?: string
  requested_by?: string
  payload?: Record<string, unknown>
  project_name?: string | null
  task_title?: string | null
  classification_reason?: string
}

export interface Explanation {
  why_approval_needed: string
  risks: string[]
  impact_if_approved: string[]
  impact_if_rejected: string[]
  recommendation: 'approve' | 'reject' | 'review_carefully'
  confidence: number       // 0..1
}

export function generateExplanation(input: ExplainInput): Explanation {
  const { action_type, risk_label } = input
  const subject = input.task_title ?? input.title ?? action_type
  const scope = input.project_name ? `（项目：${input.project_name}）` : ''

  const risks: string[] = []
  const impact_if_approved: string[] = []
  const impact_if_rejected: string[] = []
  let recommendation: Explanation['recommendation'] = 'review_carefully'
  let confidence = 0.6
  let why = ''

  // ── Per-risk-label commentary ──
  switch (risk_label) {
    case 'low': {
      why = `这是低风险的「${action_type}」动作${scope}。多数情况下可以放心批准。`
      impact_if_approved.push(`${subject} 会被立即执行，对生产数据无影响`)
      impact_if_rejected.push('不会有任何影响 — 但会阻塞下游任务')
      recommendation = 'approve'
      confidence = 0.85
      break
    }
    case 'medium': {
      why = `「${action_type}」会修改系统状态${scope}，因此需要你确认。`
      risks.push('改动可见但仍可手动回滚')
      impact_if_approved.push(`${subject} 进入下一步执行 — 改动会记录在 audit_logs`)
      impact_if_rejected.push('当前状态保持不变；如果有依赖任务会被阻塞')
      recommendation = 'review_carefully'
      confidence = 0.65
      break
    }
    case 'high': {
      why = `「${action_type}」会产生真实世界影响${scope} — 部署 / 数据库写入 / 外部消息。建议先确认 payload 完整、有回滚预案。`
      risks.push('对外部系统有副作用（用户、邮件、API、数据库）')
      risks.push('回滚需要人工操作；可能影响 SLA')
      impact_if_approved.push('动作立即执行；effect 立即可见')
      impact_if_approved.push('如果出错，需要追溯并手动回滚')
      impact_if_rejected.push('当前流程暂停；可以重新草拟一个更安全的版本再申请')
      recommendation = 'review_carefully'
      confidence = 0.55
      break
    }
    case 'critical': {
      why = `「${action_type}」是**关键 / 不可逆**动作${scope}。必须由你（CEO）亲自确认。`
      risks.push('动作不可逆 — 删除 / 生产部署 / 权限变更')
      risks.push('错误执行可能导致数据丢失或系统宕机')
      impact_if_approved.push('影响立即生效且无法回滚')
      impact_if_approved.push('建议同时通知团队 / 设置降级预案')
      impact_if_rejected.push('系统保持当前状态；后续可以重新申请并补充验证步骤')
      recommendation = 'reject'   // default conservative; user can override
      confidence = 0.4
      break
    }
  }

  // ── Payload-specific signals ──
  if (input.payload) {
    const payloadStr = JSON.stringify(input.payload).toLowerCase()
    if (/\b(drop|truncate|delete.*from)\b/.test(payloadStr)) {
      risks.push('payload 中检测到破坏性 SQL 关键字')
      recommendation = 'reject'
      confidence = Math.min(confidence, 0.3)
    }
    if (/main|master/.test(String(input.payload.branch ?? ''))) {
      risks.push('目标分支是 main / master — 直接修改主分支')
      if (recommendation === 'approve') recommendation = 'review_carefully'
    }
    if (input.payload.requires_rollback === false) {
      risks.push('未提供回滚预案')
    }
  }

  // ── Classification reason from upstream classifier (if any) ──
  if (input.classification_reason) {
    risks.unshift(input.classification_reason)
  }

  // Guarantee non-empty lists for UI consistency
  if (risks.length === 0) risks.push('无显著风险信号')
  if (impact_if_approved.length === 0) impact_if_approved.push('动作执行；结果记录到 audit_logs')
  if (impact_if_rejected.length === 0) impact_if_rejected.push('当前状态保持不变')

  // Clamp confidence
  if (confidence < 0.2) confidence = 0.2
  if (confidence > 0.95) confidence = 0.95

  return {
    why_approval_needed: why,
    risks,
    impact_if_approved,
    impact_if_rejected,
    recommendation,
    confidence: Number(confidence.toFixed(2)),
  }
}

// Render the explanation as a single readable string for storage in
// approval_requests.explanation.
export function explanationToText(e: Explanation): string {
  const lines: string[] = []
  lines.push('## 为什么需要审批')
  lines.push(e.why_approval_needed)
  lines.push('')
  lines.push('## 风险')
  for (const r of e.risks) lines.push(`- ${r}`)
  lines.push('')
  lines.push('## 批准后的影响')
  for (const x of e.impact_if_approved) lines.push(`- ${x}`)
  lines.push('')
  lines.push('## 拒绝后的影响')
  for (const x of e.impact_if_rejected) lines.push(`- ${x}`)
  lines.push('')
  lines.push(`## 建议: ${e.recommendation === 'approve' ? '✅ 批准' : e.recommendation === 'reject' ? '❌ 拒绝' : '⚠ 仔细审查'} (confidence ${Math.round(e.confidence * 100)}%)`)
  return lines.join('\n')
}
