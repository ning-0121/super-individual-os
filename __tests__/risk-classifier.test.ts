import { describe, it, expect } from 'vitest'
import { classifyRisk, getRiskLevel, requiresApproval } from '@/lib/managers/risk-classifier'
import { evaluateApprovalLevel } from '@/services/managers'

describe('risk classifier — L0 read-only', () => {
  it('listRepos is L0', () => {
    const r = classifyRisk({ action_type: 'tool.github.listRepos' })
    expect(r.level).toBe(0)
    expect(r.required_approvers).toEqual([])
  })

  it('getDeploymentStatus is L0', () => {
    expect(getRiskLevel({ action_type: 'tool.vercel.getDeploymentStatus' })).toBe(0)
  })

  it('validateSql is L0', () => {
    expect(getRiskLevel({ action_type: 'tool.supabase.validateSql' })).toBe(0)
  })

  it('read.* is L0', () => {
    expect(getRiskLevel({ action_type: 'read.tasks' })).toBe(0)
  })
})

describe('risk classifier — L1 internal write', () => {
  it('memory.create is L1', () => {
    const r = classifyRisk({ action_type: 'memory.create' })
    expect(r.level).toBe(1)
    expect(r.required_approvers).toEqual([])
  })

  it('artifact.create is L1', () => {
    expect(getRiskLevel({ action_type: 'artifact.create' })).toBe(1)
  })

  it('task.run with non-risky agent is L1', () => {
    const r = classifyRisk({
      action_type: 'task.run',
      agent_type: 'research',
      tools_allowed: [],
    })
    expect(r.level).toBe(1)
    expect(r.required_approvers).toEqual([])
  })

  it('task.run with QA agent is L1', () => {
    const r = classifyRisk({
      action_type: 'task.run',
      agent_type: 'qa',
      tools_allowed: ['github'],   // even with github, qa is review-only
    })
    expect(r.level).toBe(1)
  })
})

describe('risk classifier — L2 domain-restricted', () => {
  it('tool.github.createPullRequest is L2 with engineering_manager', () => {
    const r = classifyRisk({ action_type: 'tool.github.createPullRequest' })
    expect(r.level).toBe(2)
    expect(r.required_approvers).toContain('engineering_manager')
  })

  it('tool.github.createIssue is L2', () => {
    expect(getRiskLevel({ action_type: 'tool.github.createIssue' })).toBe(2)
  })

  it('task.run with engineering agent + github tool is L2', () => {
    const r = classifyRisk({
      action_type: 'task.run',
      agent_type: 'engineering',
      tools_allowed: ['github'],
    })
    expect(r.level).toBe(2)
    expect(r.required_approvers).toContain('engineering_manager')
  })

  it('requiresApproval returns true for L2', () => {
    expect(requiresApproval({ action_type: 'tool.github.createPullRequest' })).toBe(true)
  })
})

describe('risk classifier — L3 high-impact', () => {
  it('production deploy is L3 with engineering+QA', () => {
    const r = classifyRisk({ action_type: 'production.deploy' })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toEqual(expect.arrayContaining(['engineering_manager', 'qa_manager']))
  })

  it('mass.email_send is L3', () => {
    const r = classifyRisk({ action_type: 'mass.email_send' })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toContain('qa_manager')
  })

  it('affects_production=true forces L3', () => {
    const r = classifyRisk({ action_type: 'random.action', affects_production: true })
    expect(r.level).toBe(3)
  })

  it('cost > $5 is L3 with finance_manager', () => {
    const r = classifyRisk({ action_type: 'task.run', cost_estimate_usd: 10 })
    expect(r.level).toBe(3)
    expect(r.required_approvers).toContain('finance_manager')
  })

  it('L3 requires QA per spec', () => {
    const r = classifyRisk({ action_type: 'production.deploy' })
    expect(r.required_approvers).toContain('qa_manager')
  })
})

describe('risk classifier — L4 critical', () => {
  it('cost > $50 is L4 with CEO', () => {
    const r = classifyRisk({ action_type: 'task.run', cost_estimate_usd: 100 })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toEqual(['ceo'])
  })

  it('pricing.change is L4 with CEO', () => {
    const r = classifyRisk({ action_type: 'pricing.change' })
    expect(r.level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })

  it('key.rotation is L4', () => {
    expect(getRiskLevel({ action_type: 'key.rotation' })).toBe(4)
  })

  it('drop database is L4', () => {
    expect(getRiskLevel({ action_type: 'drop.database' })).toBe(4)
  })

  it('L4 requires CEO per spec', () => {
    const r = classifyRisk({ action_type: 'pricing.change' })
    expect(r.required_approvers).toContain('ceo')
  })
})

describe('risk classifier — risk_flag escalation', () => {
  it('cashflow_sensitive escalates L2 → L3', () => {
    const r = classifyRisk({
      action_type: 'tool.github.createPullRequest',
      risk_flags: ['cashflow_sensitive'],
    })
    expect(r.level).toBe(3)
    expect(r.required_approvers.length).toBeGreaterThanOrEqual(1)
  })

  it('attention_overload escalates L1 → L2', () => {
    const r = classifyRisk({
      action_type: 'memory.create',
      risk_flags: ['attention_overload'],
    })
    expect(r.level).toBe(2)
  })

  it('escalation caps at L4', () => {
    const r = classifyRisk({
      action_type: 'pricing.change',                // already L4
      risk_flags: ['cashflow_sensitive'],
    })
    expect(r.level).toBe(4)
  })

  it('unrecognized risk_flag does not escalate', () => {
    const r = classifyRisk({
      action_type: 'memory.create',
      risk_flags: ['some_unknown_flag'],
    })
    expect(r.level).toBe(1)
  })
})

describe('service-layer evaluateApprovalLevel', () => {
  it('mirrors classifyRisk shape', () => {
    const result = evaluateApprovalLevel('tool.github.createPullRequest')
    expect(result.level).toBe(2)
    expect(result.required_approvers).toContain('engineering_manager')
    expect(result.reason).toBeTruthy()
  })

  it('accepts risk_flags as second arg', () => {
    const result = evaluateApprovalLevel('memory.create', ['cashflow_sensitive'])
    expect(result.level).toBe(2)
  })
})
