// ─────────────────────────────────────────────────
// V2.4 — Approval risk classifier (pure)
// Maps action_type → human-friendly risk label.
// Used by /api/approval-requests POST (create) and Explain endpoint.
// ─────────────────────────────────────────────────

export type RiskLabel = 'low' | 'medium' | 'high' | 'critical'

// First match wins. Order matters — most specific first.
const RULES: Array<{ pattern: RegExp; label: RiskLabel; reason: string }> = [
  // Specific overrides BEFORE generic patterns:
  // - supabase.migration.create is L2 (draft only) — must beat the generic
  //   "migration" → high rule below.
  { pattern: /^supabase\.migration\.create$/i,                                 label: 'medium', reason: '生成迁移文件（未执行）' },

  // ── Critical (destructive / irreversible) ──
  // Match delete/drop/etc as dot-/underscore-separated tokens too
  // (e.g. "tasks.bulk_delete" → critical).
  { pattern: /(?:^|[._])(delete|drop|truncate|wipe|purge)(?![a-z])/i,          label: 'critical', reason: '删除/清空数据' },
  { pattern: /\b(destructive_sql|destructive)\b/i,                             label: 'critical', reason: '破坏性 SQL 操作' },
  { pattern: /\bpermission|role\.modify|rbac\.change\b/i,                      label: 'critical', reason: '修改权限' },
  { pattern: /production.*(deploy|apply|migration|destructive|wipe)/i,         label: 'critical', reason: '生产环境破坏性操作' },
  { pattern: /supabase\.migration\.apply_production/i,                         label: 'critical', reason: '应用生产数据库迁移' },
  { pattern: /vercel\.deploy\.production/i,                                    label: 'critical', reason: '触发生产部署' },
  { pattern: /github\.pr\.merge/i,                                             label: 'critical', reason: '合并主分支不可逆' },

  // ── High (real-world impact) ──
  { pattern: /\b(deploy|deployment)\b(?!\.preview)/i,                          label: 'high', reason: '触发部署' },
  { pattern: /\b(migration|schema\.write|database\.write|sql\.write)\b/i,      label: 'high', reason: '修改数据库' },
  { pattern: /\b(batch|bulk).*(task|email|update|delete|modify)/i,             label: 'high', reason: '批量修改任务' },
  { pattern: /(email|sms|notification)\.(send|broadcast|mass)/i,               label: 'high', reason: '发送外部邮件 / 消息' },
  { pattern: /\bvercel\.env\.update\b/i,                                       label: 'high', reason: '修改环境变量' },
  { pattern: /supabase\.migration\.apply_staging/i,                            label: 'high', reason: '应用 staging 数据库迁移' },
  { pattern: /github\.file\.write/i,                                           label: 'high', reason: '直接写入 GitHub 仓库' },

  // ── Medium (config / state mutations) ──
  { pattern: /project\.(status|state)\.(change|update)|project\.archive/i,     label: 'medium', reason: '修改项目状态' },
  { pattern: /workflow\.(create|update|modify)|workflow\.new/i,                label: 'medium', reason: '创建/修改 workflow' },
  { pattern: /manager_report\.create|manager\.report\.create/i,                label: 'medium', reason: '创建 manager report' },
  { pattern: /github\.(pr\.create|branch\.create|issue\.create|pr\.comment)/i, label: 'medium', reason: 'GitHub 写操作' },
  { pattern: /vercel\.deploy\.preview/i,                                       label: 'medium', reason: 'preview 部署' },
  { pattern: /supabase\.migration\.create/i,                                   label: 'medium', reason: '生成迁移文件' },
  { pattern: /policy\.(create|update)/i,                                       label: 'medium', reason: '修改策略' },

  // ── Low (creation / generation only) ──
  { pattern: /\b(task|todo)\.create\b/i,                                       label: 'low', reason: '创建任务' },
  { pattern: /(copy|content|report|summary|brief|draft)\.(generate|create)/i,  label: 'low', reason: '生成文案/报告' },
  { pattern: /\b(read|list|fetch|query|search|view)\b/i,                       label: 'low', reason: '只读 / 查询' },
  { pattern: /sql\.validate/i,                                                 label: 'low', reason: '静态 SQL 校验' },
]

export function classifyActionRisk(actionType: string): { label: RiskLabel; reason: string } {
  if (!actionType) return { label: 'low', reason: '未指定 action_type' }
  for (const r of RULES) {
    if (r.pattern.test(actionType)) return { label: r.label, reason: r.reason }
  }
  // Default to medium when the action is non-trivial but unknown
  return { label: 'medium', reason: '未知动作类型 — 默认 medium 等级' }
}

// Map numeric risk_level (V2.0–V2.3 — 0..4) ↔ label (V2.4 — low|medium|high|critical)
export function riskLevelToLabel(level: number): RiskLabel {
  if (level <= 1) return 'low'
  if (level === 2) return 'medium'
  if (level === 3) return 'high'
  return 'critical'
}

export function riskLabelToLevel(label: RiskLabel): number {
  switch (label) {
    case 'low':      return 1
    case 'medium':   return 2
    case 'high':     return 3
    case 'critical': return 4
  }
}

// Ordering helper for filters ("≥ high")
export const RISK_ORDER: Record<RiskLabel, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
}
