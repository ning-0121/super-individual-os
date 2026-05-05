import type { ExecutionPolicy, PolicyRule, PolicyType, RiskLevel, ManagerRole } from '@/types'

// ─────────────────────────────────────────────────
// V2.1 — Policy evaluator (pure function)
// Match a dispatch context against an ordered policy list.
// Higher priority first; first match wins.
// ─────────────────────────────────────────────────

export interface EvalContext {
  action_type: string
  risk_level: RiskLevel
  agent_type?: string
  tools_allowed?: string[]
  cost_estimate_usd?: number
  risk_flags?: string[]
}

export interface EvalResult {
  decision: PolicyType
  matched_policy_id?: string
  matched_policy_name?: string
  ai_manager_role?: ManagerRole                  // primary
  ai_manager_roles_required?: ManagerRole[]      // V2.1+ all must approve
  require_qa?: boolean
  require_ceo?: boolean
  reason: string
}

// ─────────────────────────────────────────────────
// Evaluate one rule against a context
// ─────────────────────────────────────────────────
export function ruleMatches(rule: PolicyRule, ctx: EvalContext): boolean {
  const m = rule.match
  if (!m) return true   // no match block = catch-all

  if (m.action_type_pattern) {
    try {
      if (!new RegExp(m.action_type_pattern).test(ctx.action_type)) return false
    } catch { /* malformed regex — skip */ return false }
  }
  if (m.risk_level_min !== undefined && ctx.risk_level < m.risk_level_min) return false
  if (m.risk_level_max !== undefined && ctx.risk_level > m.risk_level_max) return false

  if (m.agent_types && m.agent_types.length > 0) {
    if (!ctx.agent_type || !m.agent_types.includes(ctx.agent_type)) return false
  }

  const tools = ctx.tools_allowed ?? []
  if (m.tools_required_any && m.tools_required_any.length > 0) {
    if (!m.tools_required_any.some(t => tools.includes(t))) return false
  }
  if (m.tools_forbidden_any && m.tools_forbidden_any.length > 0) {
    if (m.tools_forbidden_any.some(t => tools.includes(t))) return false
  }

  if (m.cost_max_usd !== undefined) {
    if ((ctx.cost_estimate_usd ?? 0) > m.cost_max_usd) return false
  }

  if (m.risk_flags_any && m.risk_flags_any.length > 0) {
    const flags = ctx.risk_flags ?? []
    if (!m.risk_flags_any.some(f => flags.includes(f))) return false
  }

  return true
}

// ─────────────────────────────────────────────────
// Evaluate a list of policies, return the matching decision
// ─────────────────────────────────────────────────
export function evaluatePolicies(
  policies: ExecutionPolicy[],
  ctx: EvalContext,
): EvalResult {
  const active = policies
    .filter(p => p.is_active)
    .sort((a, b) => b.priority - a.priority)

  for (const p of active) {
    if (ruleMatches(p.rule, ctx)) {
      return {
        decision: p.policy_type,
        matched_policy_id: p.id,
        matched_policy_name: p.policy_name,
        ai_manager_role: p.rule.ai_manager_role,
        ai_manager_roles_required: p.rule.ai_manager_roles_required,
        require_qa: p.rule.require_qa,
        require_ceo: p.rule.require_ceo,
        reason: p.rule.reason ?? `Matched policy: ${p.policy_name}`,
      }
    }
  }

  // No policy matched → conservative default
  return {
    decision: 'human_required',
    reason: 'No policy matched (conservative default)',
  }
}
