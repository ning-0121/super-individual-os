import { describe, it, expect } from 'vitest'
import { ruleMatches, evaluatePolicies } from '@/lib/managers/policy-evaluator'
import { DEFAULT_POLICIES } from '@/lib/managers/default-policies'
import type { ExecutionPolicy, PolicyRule } from '@/types'

function policy(name: string, priority: number, rule: PolicyRule, id = name): ExecutionPolicy {
  return {
    id, user_id: 'u1', project_id: null, scope: 'global',
    policy_name: name, policy_type: rule.action,
    rule, priority, is_active: true,
    created_at: '', updated_at: '',
  }
}

describe('ruleMatches — primitive matching', () => {
  it('empty match block matches anything', () => {
    expect(ruleMatches({ action: 'auto_approve' }, { action_type: 'foo', risk_level: 0 })).toBe(true)
  })

  it('action_type_pattern regex', () => {
    const r: PolicyRule = { match: { action_type_pattern: '^tool\\.github\\.' }, action: 'ai_manager' }
    expect(ruleMatches(r, { action_type: 'tool.github.createPR', risk_level: 2 })).toBe(true)
    expect(ruleMatches(r, { action_type: 'tool.vercel.list', risk_level: 0 })).toBe(false)
  })

  it('risk_level_min / risk_level_max bounds', () => {
    const r: PolicyRule = { match: { risk_level_min: 2, risk_level_max: 3 }, action: 'ai_manager' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1 })).toBe(false)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 2 })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 3 })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 4 })).toBe(false)
  })

  it('agent_types whitelist', () => {
    const r: PolicyRule = { match: { agent_types: ['research', 'qa'] }, action: 'auto_approve' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, agent_type: 'research' })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, agent_type: 'engineering' })).toBe(false)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1 })).toBe(false)
  })

  it('tools_required_any', () => {
    const r: PolicyRule = { match: { tools_required_any: ['github'] }, action: 'ai_manager' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 2, tools_allowed: ['github'] })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 2, tools_allowed: ['vercel'] })).toBe(false)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 2 })).toBe(false)
  })

  it('tools_forbidden_any', () => {
    const r: PolicyRule = { match: { tools_forbidden_any: ['github'] }, action: 'auto_approve' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, tools_allowed: ['github'] })).toBe(false)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, tools_allowed: [] })).toBe(true)
  })

  it('cost_max_usd cap', () => {
    const r: PolicyRule = { match: { cost_max_usd: 5 }, action: 'auto_approve' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, cost_estimate_usd: 3 })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, cost_estimate_usd: 10 })).toBe(false)
  })

  it('risk_flags_any', () => {
    const r: PolicyRule = { match: { risk_flags_any: ['cashflow_sensitive'] }, action: 'human_required' }
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, risk_flags: ['cashflow_sensitive'] })).toBe(true)
    expect(ruleMatches(r, { action_type: 'x', risk_level: 1, risk_flags: ['something'] })).toBe(false)
  })

  it('malformed regex does not throw', () => {
    const r: PolicyRule = { match: { action_type_pattern: '[invalid' }, action: 'auto_approve' }
    expect(() => ruleMatches(r, { action_type: 'x', risk_level: 0 })).not.toThrow()
    expect(ruleMatches(r, { action_type: 'x', risk_level: 0 })).toBe(false)
  })
})

describe('evaluatePolicies — priority + first-match-wins', () => {
  it('returns higher-priority match', () => {
    const p1 = policy('low', 10, { match: {}, action: 'auto_approve' })
    const p2 = policy('high', 90, { match: {}, action: 'human_required' })
    const r = evaluatePolicies([p1, p2], { action_type: 'foo', risk_level: 0 })
    expect(r.matched_policy_name).toBe('high')
    expect(r.decision).toBe('human_required')
  })

  it('skips non-matching policies', () => {
    const policies = [
      policy('a', 100, { match: { agent_types: ['nonexistent'] }, action: 'block' }),
      policy('b', 50, { match: {}, action: 'auto_approve' }),
    ]
    const r = evaluatePolicies(policies, { action_type: 'foo', risk_level: 0 })
    expect(r.matched_policy_name).toBe('b')
  })

  it('falls through to conservative default when nothing matches', () => {
    const policies = [
      policy('only', 100, { match: { agent_types: ['xyz'] }, action: 'auto_approve' }),
    ]
    const r = evaluatePolicies(policies, { action_type: 'foo', risk_level: 0 })
    expect(r.decision).toBe('human_required')
    expect(r.matched_policy_name).toBeUndefined()
  })

  it('skips inactive policies', () => {
    const inactive = { ...policy('inactive', 100, { match: {}, action: 'auto_approve' }), is_active: false }
    const active = policy('active', 50, { match: {}, action: 'human_required' })
    const r = evaluatePolicies([inactive, active], { action_type: 'foo', risk_level: 0 })
    expect(r.matched_policy_name).toBe('active')
  })
})

describe('default policies — end-to-end behaviour', () => {
  // Build a fake policy list from defaults
  const defaultPolicies: ExecutionPolicy[] = DEFAULT_POLICIES.map((p, i) => policy(p.policy_name, p.priority, p.rule, `def-${i}`))

  it('L1 read action is auto_approved', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'read.tasks', risk_level: 0,
    })
    expect(r.decision).toBe('auto_approve')
  })

  it('research agent task.run is auto_approved', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'task.run', risk_level: 1, agent_type: 'research', tools_allowed: [],
    })
    expect(r.decision).toBe('auto_approve')
  })

  it('GitHub createPullRequest goes to ai_manager (engineering + qa)', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'tool.github.createPullRequest', risk_level: 2,
    })
    expect(r.decision).toBe('ai_manager')
    expect(r.ai_manager_roles_required).toContain('engineering_manager')
    expect(r.ai_manager_roles_required).toContain('qa_manager')
  })

  it('engineering task.run with github goes to ai_manager', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'task.run', risk_level: 2,
      agent_type: 'engineering', tools_allowed: ['github'],
    })
    expect(r.decision).toBe('ai_manager')
    expect(r.ai_manager_role).toBe('engineering_manager')
  })

  it('L4 critical action is human_required (CEO)', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'pricing.change', risk_level: 4,
    })
    expect(r.decision).toBe('human_required')
  })

  it('L3 high-impact goes to ai_manager (qa_manager)', () => {
    const r = evaluatePolicies(defaultPolicies, {
      action_type: 'production.deploy', risk_level: 3,
    })
    expect(r.decision).toBe('ai_manager')
    expect(r.ai_manager_roles_required).toContain('qa_manager')
  })
})
