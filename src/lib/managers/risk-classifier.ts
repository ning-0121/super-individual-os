import type { RiskLevel, ManagerRole } from '@/types'

// ─────────────────────────────────────────────────
// Risk classification: action_type + context → L0..L4
// Pure function, no DB access. Fully unit-testable.
// ─────────────────────────────────────────────────

export interface ClassifyInput {
  action_type: string                 // e.g. 'task.run', 'tool.github.createPullRequest'
  agent_type?: string                 // e.g. 'engineering', 'research'
  tools_allowed?: string[]            // e.g. ['github', 'supabase']
  cost_estimate_usd?: number
  affects_production?: boolean
  risk_flags?: string[]               // from decision-engine
}

export interface ClassifyResult {
  level: RiskLevel
  required_approvers: ManagerRole[]
  reason: string
}

// ─────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────
const COST_L4_THRESHOLD = 50    // USD
const COST_L3_THRESHOLD = 5     // USD

const READ_ONLY_PATTERNS = [
  /^read\./,
  /\.list[A-Z]/,                // listRepos, listDeployments, listTables
  /\.get[A-Z]/,                 // getProject, getDeploymentStatus
  /\.validate/,                  // validateSql
  /\.health$/,
]

const L1_INTERNAL_PATTERNS = [
  /^memory\.create/,
  /^artifact\.create/,
  /^conversation\.create/,
  /^chat\.message/,
]

const L2_DOMAIN_PATTERNS: Array<{ pattern: RegExp; approvers: ManagerRole[] }> = [
  { pattern: /^tool\.github\.createPullRequest/, approvers: ['engineering_manager'] },
  { pattern: /^tool\.github\.createIssue/,       approvers: ['engineering_manager'] },
  { pattern: /^tool\.supabase\.createMigration/, approvers: ['engineering_manager'] },
]

const L3_HIGH_IMPACT_PATTERNS: Array<{ pattern: RegExp; approvers: ManagerRole[] }> = [
  { pattern: /production|deploy|release/i,             approvers: ['engineering_manager', 'qa_manager'] },
  { pattern: /mass|broadcast|bulk_send/i,              approvers: ['growth_manager', 'qa_manager'] },
  { pattern: /^public\./i,                              approvers: ['risk_manager', 'qa_manager'] },
  { pattern: /merge.*main|push.*main/i,                approvers: ['engineering_manager', 'qa_manager'] },
]

const L4_CRITICAL_PATTERNS: Array<{ pattern: RegExp }> = [
  { pattern: /pricing|payment|billing|subscription/i },
  { pattern: /key.?rotation|secret.?rotation/i },
  { pattern: /delete.?(database|schema|all)/i },
  { pattern: /drop.?(database|schema)/i },
]

// ─────────────────────────────────────────────────
// Risk-flag escalations (additive on top of base)
// ─────────────────────────────────────────────────
const RISK_FLAG_ESCALATIONS: Record<string, number> = {
  cashflow_sensitive: 1,
  attention_overload: 1,
  lack_of_focus:      1,
  resource_spread:    1,
  task_overload:      0,
}

// ─────────────────────────────────────────────────
// Main classifier
// ─────────────────────────────────────────────────
export function classifyRisk(input: ClassifyInput): ClassifyResult {
  const action = input.action_type

  // 0. L0 fast-path — read-only / safe operations (must check before L3 patterns
  //    so e.g. `getDeploymentStatus` doesn't match the broader 'deploy' regex)
  for (const pattern of READ_ONLY_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({ level: 0, required_approvers: [], reason: `read-only matched ${pattern}` }, input.risk_flags)
    }
  }

  // 1. L4 — critical (cost, security, business)
  if (input.cost_estimate_usd !== undefined && input.cost_estimate_usd > COST_L4_THRESHOLD) {
    return finalize({
      level: 4,
      required_approvers: ['ceo'],
      reason: `cost ${input.cost_estimate_usd} USD > ${COST_L4_THRESHOLD}`,
    }, input.risk_flags)
  }
  for (const { pattern } of L4_CRITICAL_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({
        level: 4,
        required_approvers: ['ceo'],
        reason: `critical action matched ${pattern}`,
      }, input.risk_flags)
    }
  }

  // 2. L3 — high impact (production deploy, mass communication)
  for (const { pattern, approvers } of L3_HIGH_IMPACT_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({
        level: 3,
        required_approvers: approvers,
        reason: `high-impact action matched ${pattern}`,
      }, input.risk_flags)
    }
  }
  if (input.affects_production) {
    return finalize({
      level: 3,
      required_approvers: ['engineering_manager', 'qa_manager'],
      reason: 'affects_production=true',
    }, input.risk_flags)
  }
  // Cost L3 (between $5 and $50)
  if (input.cost_estimate_usd !== undefined && input.cost_estimate_usd > COST_L3_THRESHOLD) {
    return finalize({
      level: 3,
      required_approvers: ['finance_manager', 'qa_manager'],
      reason: `cost ${input.cost_estimate_usd} USD > ${COST_L3_THRESHOLD}`,
    }, input.risk_flags)
  }

  // 3. L2 — domain-restricted (PR, Issue, etc.)
  for (const { pattern, approvers } of L2_DOMAIN_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({
        level: 2,
        required_approvers: approvers,
        reason: `domain action matched ${pattern}`,
      }, input.risk_flags)
    }
  }

  // 4. task.run special case — depends on agent role + tools
  if (action === 'task.run' || action.startsWith('task.run.')) {
    // QA agent — review-only, never produces external side-effects
    // (even with github in toolbox, it inspects PRs, doesn't create them)
    if (input.agent_type === 'qa') {
      return finalize({ level: 1, required_approvers: [], reason: 'qa agent run (review only)' }, input.risk_flags)
    }
    // Knowledge / planning agents — text deliverables, no external action
    if (input.agent_type && ['research', 'strategic', 'product', 'finance', 'design', 'legal'].includes(input.agent_type)) {
      return finalize({
        level: 1, required_approvers: [],
        reason: `${input.agent_type} agent run (text deliverable, no external action)`,
      }, input.risk_flags)
    }

    const tools = input.tools_allowed ?? []
    if (tools.includes('github')) {
      return finalize({
        level: 2, required_approvers: ['engineering_manager'],
        reason: 'task.run with github tool (may create external PR)',
      }, input.risk_flags)
    }
    if (tools.includes('vercel') && (input.agent_type === 'devops' || input.agent_type === 'engineering')) {
      return finalize({
        level: 2, required_approvers: ['engineering_manager'],
        reason: 'task.run with vercel + engineering/devops agent',
      }, input.risk_flags)
    }
    return finalize({ level: 1, required_approvers: [], reason: 'standard agent run, no risky tools' }, input.risk_flags)
  }

  // 5. L1 — low-impact internal
  for (const pattern of L1_INTERNAL_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({ level: 1, required_approvers: [], reason: `internal write matched ${pattern}` }, input.risk_flags)
    }
  }

  // 6. L0 — read-only / safe
  for (const pattern of READ_ONLY_PATTERNS) {
    if (pattern.test(action)) {
      return finalize({ level: 0, required_approvers: [], reason: `read-only matched ${pattern}` }, input.risk_flags)
    }
  }

  // Default: L1
  return finalize({ level: 1, required_approvers: [], reason: 'unmapped action, default L1' }, input.risk_flags)
}

// ─────────────────────────────────────────────────
// Apply risk-flag escalations + clamp to [0, 4]
// ─────────────────────────────────────────────────
function finalize(base: ClassifyResult, riskFlags?: string[]): ClassifyResult {
  if (!riskFlags || riskFlags.length === 0) return base

  let escalation = 0
  const triggered: string[] = []
  for (const f of riskFlags) {
    const e = RISK_FLAG_ESCALATIONS[f] ?? 0
    if (e > 0) {
      escalation = Math.max(escalation, e)
      triggered.push(f)
    }
  }

  if (escalation === 0) return base

  const newLevel = Math.min(4, base.level + escalation) as RiskLevel
  if (newLevel === base.level) return base

  // Promote required_approvers based on new level
  let approvers = base.required_approvers
  if (newLevel >= 4) approvers = ['ceo']
  else if (newLevel === 3 && approvers.length < 2) {
    approvers = [...approvers, 'qa_manager']
  } else if (newLevel === 2 && approvers.length === 0) {
    approvers = ['risk_manager']
  }

  return {
    level: newLevel,
    required_approvers: dedupe(approvers),
    reason: `${base.reason} + escalated by risk_flags: ${triggered.join(', ')}`,
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

// ─────────────────────────────────────────────────
// Convenience: just compute level
// ─────────────────────────────────────────────────
export function getRiskLevel(input: ClassifyInput): RiskLevel {
  return classifyRisk(input).level
}

export function requiresApproval(input: ClassifyInput): boolean {
  return classifyRisk(input).level >= 2
}
