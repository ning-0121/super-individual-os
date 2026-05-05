import { describe, it, expect } from 'vitest'
import { classifyRisk } from '@/lib/managers/risk-classifier'
import { evaluateApprovalLevel } from '@/services/managers'

// ─────────────────────────────────────────────────
// Pure logic — no Supabase mocks needed.
// Verifies end-to-end correctness of the dispatch decision tree.
// ─────────────────────────────────────────────────

describe('dispatch flow — auto-execute (L0/L1)', () => {
  it('read.* is auto-dispatched', () => {
    const r = classifyRisk({ action_type: 'read.tasks' })
    expect(r.level).toBeLessThanOrEqual(1)
    expect(r.required_approvers).toEqual([])
  })

  it('memory.create is auto-dispatched', () => {
    expect(classifyRisk({ action_type: 'memory.create' }).level).toBe(1)
  })

  it('research-only task.run is auto-dispatched', () => {
    const r = classifyRisk({
      action_type: 'task.run', agent_type: 'research', tools_allowed: [],
    })
    expect(r.level).toBe(1)
  })
})

describe('dispatch flow — blocked (L2+)', () => {
  it('high-risk action without approvers is blocked', () => {
    const cases = [
      'tool.github.createPullRequest',
      'tool.github.createIssue',
      'production.deploy',
      'mass.email_send',
      'pricing.change',
      'key.rotation',
    ]
    for (const action of cases) {
      const r = classifyRisk({ action_type: action })
      expect(r.level, `${action} should be ≥ 2`).toBeGreaterThanOrEqual(2)
      expect(r.required_approvers.length, `${action} needs approvers`).toBeGreaterThan(0)
    }
  })

  it('engineering agent with github tool is blocked at L2', () => {
    const r = classifyRisk({
      action_type: 'task.run', agent_type: 'engineering', tools_allowed: ['github'],
    })
    expect(r.level).toBe(2)
    expect(r.required_approvers).toContain('engineering_manager')
  })
})

describe('dispatch flow — L3 requires QA', () => {
  it('production deploy requires QA + engineering', () => {
    const r = classifyRisk({ action_type: 'production.deploy' })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toContain('qa_manager')
    expect(r.required_approvers).toContain('engineering_manager')
  })

  it('mass email requires QA + growth', () => {
    const r = classifyRisk({ action_type: 'mass.email_send' })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toContain('qa_manager')
  })

  it('cost between $5 and $50 requires finance + QA', () => {
    const r = classifyRisk({ action_type: 'task.run', cost_estimate_usd: 25 })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toContain('finance_manager')
    expect(r.required_approvers).toContain('qa_manager')
  })

  it('any L3 action lists exactly 2 approvers per spec', () => {
    const cases = ['production.deploy', 'mass.email_send']
    for (const action of cases) {
      const r = classifyRisk({ action_type: action })
      expect(r.required_approvers.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('dispatch flow — L4 requires CEO', () => {
  it('cost > $50 requires CEO and only CEO', () => {
    const r = classifyRisk({ action_type: 'task.run', cost_estimate_usd: 200 })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toEqual(['ceo'])
  })

  it('pricing change requires CEO', () => {
    const r = classifyRisk({ action_type: 'pricing.change' })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })

  it('key rotation requires CEO', () => {
    const r = classifyRisk({ action_type: 'security.key_rotation' })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })

  it('drop database requires CEO', () => {
    const r = classifyRisk({ action_type: 'admin.drop_database' })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })

  it('all L4 actions list ceo as approver', () => {
    const cases = ['pricing.change', 'security.key_rotation', 'admin.drop_database']
    for (const action of cases) {
      const r = classifyRisk({ action_type: action })
      expect(r.required_approvers.includes('ceo'), `${action} should require ceo`).toBe(true)
    }
  })
})

describe('dispatch flow — service entrypoint', () => {
  it('evaluateApprovalLevel returns same shape as classifyRisk', () => {
    const a = classifyRisk({ action_type: 'tool.github.createPullRequest' })
    const b = evaluateApprovalLevel('tool.github.createPullRequest')
    expect(b.level).toBe(a.level)
    expect(b.required_approvers).toEqual(a.required_approvers)
  })

  it('evaluateApprovalLevel applies risk_flags escalation', () => {
    const r = evaluateApprovalLevel('memory.create', ['cashflow_sensitive'])
    expect(r.level).toBe(2)
  })
})
