import { describe, it, expect } from 'vitest'
import {
  ctoAutoDecision, qaAutoDecision, cooAutoDecision,
  cpoAutoDecision, cgoAutoDecision, csoAutoDecision,
  type AutoDecisionInput,
} from '@/services/manager-auto-decision'
import type { ApprovalRequest, RiskLevel, ManagerRole } from '@/types'

function makeReq(over: Partial<ApprovalRequest> & { risk_level: RiskLevel }): ApprovalRequest {
  return {
    id: 'req-1',
    user_id: 'u-1',
    project_id: 'p-1',
    task_id: 't-1',
    task_run_id: null,
    action_type: 'github.pr.create',
    action_payload: {},
    required_approvers: ['engineering_manager'] as ManagerRole[],
    approvers_acted: [],
    status: 'pending',
    classification_reason: '',
    expires_at: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
    ...over,
  }
}

const goodTask = {
  title: 'Add login button',
  description: 'Add a primary login button to the header bar with proper accessibility',
  acceptance_criteria: 'Button renders, click navigates to /login, axe a11y passes',
}

describe('ctoAutoDecision', () => {
  it('escalates L4 critical actions', () => {
    const r = makeReq({ risk_level: 4, action_type: 'vercel.deploy.production' })
    const out = ctoAutoDecision({ request: r, task: goodTask })
    expect(out.decision).toBe('escalate')
  })

  it('escalates destructive SQL (DROP TABLE)', () => {
    const r = makeReq({
      risk_level: 3,
      action_type: 'supabase.migration.create',
      action_payload: { sql: 'DROP TABLE users;' },
    })
    expect(ctoAutoDecision({ request: r, task: goodTask }).decision).toBe('escalate')
  })

  it('revises migration without rollback plan', () => {
    const r = makeReq({
      risk_level: 3,
      action_type: 'supabase.migration.create',
      action_payload: { sql: 'ALTER TABLE foo ADD COLUMN bar text;' },
    })
    expect(ctoAutoDecision({ request: r, task: goodTask }).decision).toBe('revise')
  })

  it('approves L2 reversible PR', () => {
    const r = makeReq({ risk_level: 2, action_type: 'github.pr.create' })
    expect(ctoAutoDecision({ request: r, task: goodTask }).decision).toBe('approve')
  })

  it('revises L3 missing acceptance criteria', () => {
    const r = makeReq({ risk_level: 3, action_type: 'engineering.task.run' })
    const out = ctoAutoDecision({ request: r, task: { ...goodTask, acceptance_criteria: '' } })
    expect(out.decision).toBe('revise')
  })

  it('approves L3 with rollback + acceptance criteria', () => {
    const r = makeReq({
      risk_level: 3,
      action_type: 'supabase.migration.create',
      action_payload: { sql: 'ALTER ...', notes: 'rollback: revert column' },
    })
    expect(ctoAutoDecision({ request: r, task: goodTask }).decision).toBe('approve')
  })
})

describe('qaAutoDecision', () => {
  it('escalates L4', () => {
    expect(qaAutoDecision({ request: makeReq({ risk_level: 4 }), task: goodTask }).decision)
      .toBe('escalate')
  })

  it('rejects migration without rollback', () => {
    const r = makeReq({
      risk_level: 3, action_type: 'supabase.migration.create',
      action_payload: { sql: 'ALTER TABLE foo ADD COLUMN bar text;' },
    })
    expect(qaAutoDecision({ request: r, task: goodTask }).decision).toBe('reject')
  })

  it('revises L2 without acceptance criteria', () => {
    const r = makeReq({ risk_level: 2 })
    const out = qaAutoDecision({ request: r, task: { ...goodTask, acceptance_criteria: '' } })
    expect(out.decision).toBe('revise')
  })

  it('approves L2 with acceptance criteria + clear scope', () => {
    expect(qaAutoDecision({ request: makeReq({ risk_level: 2 }), task: goodTask }).decision)
      .toBe('approve')
  })
})

describe('cooAutoDecision / cpoAutoDecision / cgoAutoDecision / csoAutoDecision', () => {
  it('all escalate L4', () => {
    const inp: AutoDecisionInput = { request: makeReq({ risk_level: 4 }), task: goodTask }
    expect(cooAutoDecision(inp).decision).toBe('escalate')
    expect(cpoAutoDecision(inp).decision).toBe('escalate')
    expect(cgoAutoDecision(inp).decision).toBe('escalate')
    expect(csoAutoDecision(inp).decision).toBe('escalate')
  })

  it('CPO revises vague scope', () => {
    const out = cpoAutoDecision({
      request: makeReq({ risk_level: 2 }),
      task: { ...goodTask, description: 'short' },
    })
    expect(out.decision).toBe('revise')
  })

  it('CGO escalates mass communication actions', () => {
    const r = makeReq({ risk_level: 2, action_type: 'email.mass.send' })
    expect(cgoAutoDecision({ request: r, task: goodTask }).decision).toBe('escalate')
  })

  it('COO/CGO/CSO approve standard L2 actions', () => {
    const inp: AutoDecisionInput = { request: makeReq({ risk_level: 2 }), task: goodTask }
    expect(cooAutoDecision(inp).decision).toBe('approve')
    expect(cgoAutoDecision(inp).decision).toBe('approve')
    expect(csoAutoDecision(inp).decision).toBe('approve')
  })
})
