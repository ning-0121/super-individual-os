import { describe, it, expect } from 'vitest'
import { synthesizeReport, type ReportInputs } from '@/services/manager-reports'

function base(over: Partial<ReportInputs> = {}): ReportInputs {
  return {
    role: 'finance_manager',
    report_type: 'daily',
    open_tasks: 0,
    blocked_tasks: 0,
    completed_tasks_7d: 0,
    failed_runs_24h: 0,
    failed_runs_7d: 0,
    pending_approvals: 0,
    pending_ceo_approvals: 0,
    ...over,
  }
}

function wf(over: Partial<NonNullable<ReportInputs['active_workflows']>[0]> = {})
  : NonNullable<ReportInputs['active_workflows']>[0]
{
  return {
    workflow_id: 'w1', workflow_name: 'Launch Landing',
    workflow_category: 'growth',
    run_id: 'r1', run_status: 'running',
    bottleneck_step_key: 'copy',
    next_action: 'dispatch copy',
    owner: '🤖 Linda',
    failed_step_count: 0,
    ...over,
  }
}

// ─────────────────────────────────────────────────
// Output contract — every report carries the workflow surface
// ─────────────────────────────────────────────────
describe('synthesizeReport output surface (V2.9)', () => {
  it('zero-workflow input emits zero counts', () => {
    const r = synthesizeReport(base({}))
    expect(r.active_workflows_count).toBe(0)
    expect(r.blocked_workflows_count).toBe(0)
    expect(r.bottleneck_step ?? null).toBeNull()
  })

  it('counts active workflows', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      active_workflows_count: 3,
      blocked_workflows_count: 1,
      active_workflows: [
        wf({ workflow_name: 'A', run_status: 'running' }),
        wf({ workflow_name: 'B', run_status: 'running' }),
        wf({ workflow_name: 'C', run_status: 'blocked_approval', bottleneck_step_key: 'review' }),
      ],
    }))
    expect(r.active_workflows_count).toBe(3)
    expect(r.blocked_workflows_count).toBe(1)
    expect(r.bottleneck_step).toBeTruthy()
  })

  it('headline uses blocked workflow first, then failed, then running', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      active_workflows: [
        wf({ workflow_name: 'X', run_status: 'running', bottleneck_step_key: 'step1' }),
        wf({ workflow_name: 'Y', run_status: 'blocked_approval', bottleneck_step_key: 'gate' }),
      ],
    }))
    expect(r.bottleneck_step).toMatch(/Y→gate/)
  })
})

// ─────────────────────────────────────────────────
// Per-role filtering
// ─────────────────────────────────────────────────
describe('synthesizeReport role-aware workflow filtering', () => {
  const mixed = [
    wf({ workflow_name: 'Landing',   workflow_category: 'growth',    run_status: 'running' }),
    wf({ workflow_name: 'Content',   workflow_category: 'content',   run_status: 'running' }),
    wf({ workflow_name: 'Feature',   workflow_category: 'product',   run_status: 'running' }),
    wf({ workflow_name: 'Weekly',    workflow_category: 'governance',run_status: 'running' }),
  ]

  it('CGO (growth_manager) surfaces growth + content workflows in next_actions', () => {
    const r = synthesizeReport(base({
      role: 'growth_manager', active_workflows: mixed, active_workflows_count: 4,
    }))
    const text = r.next_actions.join(' ')
    expect(text).toMatch(/Landing/)
    expect(text).toMatch(/Content/)
    expect(text).not.toMatch(/Feature/)        // product not in CGO scope
  })

  it('CTO (engineering_manager) surfaces product + research workflows', () => {
    const r = synthesizeReport(base({
      role: 'engineering_manager', active_workflows: mixed, active_workflows_count: 4,
    }))
    const text = r.next_actions.join(' ')
    expect(text).toMatch(/Feature/)
    expect(text).not.toMatch(/Landing/)
  })

  it('CPO (design_manager) surfaces only product', () => {
    const r = synthesizeReport(base({
      role: 'design_manager', active_workflows: mixed, active_workflows_count: 4,
    }))
    const text = r.next_actions.join(' ')
    expect(text).toMatch(/Feature/)
    expect(text).not.toMatch(/Content/)
  })

  it('COO (finance_manager) sees everything', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager', active_workflows: mixed, active_workflows_count: 4,
    }))
    const text = r.next_actions.join(' ')
    expect(text).toMatch(/Landing/)
    expect(text).toMatch(/Feature/)
    expect(text).toMatch(/Content/)
  })
})

// ─────────────────────────────────────────────────
// Blocked & failed workflows surface as blockers
// ─────────────────────────────────────────────────
describe('synthesizeReport workflow blockers + risks', () => {
  it('blocked_approval workflow becomes a blocker', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      blocked_workflows_count: 1,
      active_workflows: [
        wf({ workflow_name: 'Launch', run_status: 'blocked_approval', bottleneck_step_key: 'review' }),
      ],
    }))
    expect(r.blockers.some(b => /Launch.*review|review.*Launch/.test(b))).toBe(true)
  })

  it('failed workflow becomes a blocker', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      active_workflows: [
        wf({ workflow_name: 'Build', run_status: 'failed', bottleneck_step_key: 'implement', failed_step_count: 1 }),
      ],
    }))
    expect(r.blockers.some(b => /Build/.test(b))).toBe(true)
  })

  it('CEO escalates intervention when any blocked_approval gate exists', () => {
    const r = synthesizeReport(base({
      role: 'ceo',
      blocked_workflows_count: 1,
      active_workflows: [
        wf({ workflow_name: 'Customer Dev', run_status: 'blocked_approval', bottleneck_step_key: 'decision' }),
      ],
    }))
    expect(r.needs_user_intervention).toBe(true)
    expect(r.next_actions[0]).toMatch(/审批 gate|workflow 审批/)
  })

  it('CEO flags resource conflict when ≥3 running workflows', () => {
    const r = synthesizeReport(base({
      role: 'ceo',
      active_workflows: Array.from({ length: 4 }, (_, i) =>
        wf({ workflow_name: `W${i}`, run_status: 'running' })),
    }))
    expect(r.risks.some(rr => /资源.*冲突|资源可能冲突/.test(rr))).toBe(true)
  })

  it('CSO flags decision-delay risk on blocked gates', () => {
    const r = synthesizeReport(base({
      role: 'risk_manager',
      active_workflows: [
        wf({ workflow_name: 'X', run_status: 'blocked_approval', bottleneck_step_key: 'gate' }),
      ],
    }))
    expect(r.risks.some(rr => /决策延迟|审批 gate/.test(rr))).toBe(true)
  })
})

// ─────────────────────────────────────────────────
// Owner + next_workflow_action propagated to top-level fields
// ─────────────────────────────────────────────────
describe('synthesizeReport workflow headline propagation', () => {
  it('next_workflow_action carries through', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      active_workflows: [
        wf({ workflow_name: 'Test', run_status: 'running',
             bottleneck_step_key: 'design', next_action: 'dispatch design' }),
      ],
    }))
    expect(r.next_workflow_action).toBe('dispatch design')
  })

  it('owner_or_execution_unit propagated', () => {
    const r = synthesizeReport(base({
      role: 'finance_manager',
      active_workflows: [
        wf({ owner: '🤖 Linda', workflow_name: 'Test' }),
      ],
    }))
    expect(r.owner_or_execution_unit).toBe('🤖 Linda')
  })

  it('null when no workflows', () => {
    const r = synthesizeReport(base({}))
    expect(r.next_workflow_action).toBeNull()
    expect(r.owner_or_execution_unit).toBeNull()
  })
})
