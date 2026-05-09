import { describe, it, expect } from 'vitest'
import { synthesizeReport, type ReportInputs } from '@/services/manager-reports'

function base(over: Partial<ReportInputs>): ReportInputs {
  return {
    role: 'engineering_manager',
    report_type: 'daily',
    open_tasks: 0,
    blocked_tasks: 0,
    completed_tasks_7d: 0,
    failed_runs_24h: 0,
    failed_runs_7d: 0,
    pending_approvals: 0,
    pending_ceo_approvals: 0,
    growth_running: 0,
    growth_completed_7d: 0,
    destructive_actions_24h: 0,
    hours_since_last_activity: 1,
    ...over,
  }
}

describe('synthesizeReport — output shape', () => {
  it('always returns required fields', () => {
    const r = synthesizeReport(base({}))
    expect(r.title).toBeTruthy()
    expect(r.summary).toBeTruthy()
    expect(Array.isArray(r.blockers)).toBe(true)
    expect(Array.isArray(r.risks)).toBe(true)
    expect(Array.isArray(r.next_actions)).toBe(true)
    expect(typeof r.confidence_score).toBe('number')
    expect(r.confidence_score).toBeGreaterThanOrEqual(0)
    expect(r.confidence_score).toBeLessThanOrEqual(1)
    expect(typeof r.needs_user_intervention).toBe('boolean')
  })

  it('clean state ⇒ no blockers, no intervention', () => {
    const r = synthesizeReport(base({ open_tasks: 5, completed_tasks_7d: 3 }))
    expect(r.blockers).toEqual([])
    expect(r.needs_user_intervention).toBe(false)
  })

  it('high failure rate adds risk and lowers confidence', () => {
    const noisy = synthesizeReport(base({ failed_runs_24h: 5 }))
    const clean = synthesizeReport(base({}))
    expect(noisy.risks.some(r => /失败/.test(r))).toBe(true)
    expect(noisy.confidence_score).toBeLessThan(clean.confidence_score)
  })

  it('pending CEO approvals → blocker + needs intervention', () => {
    const r = synthesizeReport(base({ pending_ceo_approvals: 2 }))
    expect(r.blockers.some(b => /CEO/.test(b))).toBe(true)
    expect(r.needs_user_intervention).toBe(true)
  })

  it('blocked tasks surface as blocker', () => {
    const r = synthesizeReport(base({ blocked_tasks: 3, open_tasks: 5 }))
    expect(r.blockers.some(b => /阻塞/.test(b))).toBe(true)
  })

  it('long inactivity surfaces as risk', () => {
    const r = synthesizeReport(base({ hours_since_last_activity: 96 }))
    expect(r.risks.some(rk => /没有.*活动|天没有/.test(rk))).toBe(true)
  })
})

describe('synthesizeReport — role-specific behavior', () => {
  it('CTO with destructive action escalates to needs_user_intervention', () => {
    const r = synthesizeReport(base({ role: 'engineering_manager', destructive_actions_24h: 1 }))
    expect(r.needs_user_intervention).toBe(true)
    expect(r.risks.some(s => /破坏性|主分支/.test(s))).toBe(true)
  })

  it('CTO with no completion this week flags stagnation', () => {
    const r = synthesizeReport(base({ role: 'engineering_manager', open_tasks: 4, completed_tasks_7d: 0 }))
    expect(r.risks.some(s => /节奏停滞|无任务完成/.test(s))).toBe(true)
  })

  it('QA with migration failure marks intervention needed', () => {
    const r = synthesizeReport(base({
      role: 'qa_manager',
      recent_failed_actions: ['supabase.migration.apply_staging'],
    }))
    expect(r.needs_user_intervention).toBe(true)
  })

  it('CGO with no running + no completed experiments flags stalled growth loop', () => {
    const r = synthesizeReport(base({
      role: 'growth_manager', growth_running: 0, growth_completed_7d: 0,
    }))
    expect(r.blockers.some(b => /增长循环停滞/.test(b))).toBe(true)
    expect(r.next_actions.some(n => /running 实验/.test(n))).toBe(true)
  })

  it('CGO with running experiments encourages follow-up', () => {
    const r = synthesizeReport(base({
      role: 'growth_manager', growth_running: 2, growth_completed_7d: 1,
    }))
    expect(r.blockers.some(b => /增长循环停滞/.test(b))).toBe(false)
    expect(r.next_actions.length).toBeGreaterThan(0)
  })

  it('CSO summarises risk tape with no panic when clean', () => {
    const r = synthesizeReport(base({ role: 'risk_manager' }))
    expect(r.risks.some(s => /无高优风险|无显著风险/.test(s))).toBe(true)
    expect(r.needs_user_intervention).toBe(false)
  })

  it('CEO sets intervention flag when CEO queue non-empty', () => {
    const r = synthesizeReport(base({ role: 'ceo', pending_ceo_approvals: 3 }))
    expect(r.needs_user_intervention).toBe(true)
  })
})

describe('synthesizeReport — title + summary contracts', () => {
  it('title contains role label and report type', () => {
    const r = synthesizeReport(base({ role: 'engineering_manager', report_type: 'weekly' }))
    expect(r.title).toMatch(/CTO/)
    expect(r.title).toMatch(/weekly/)
  })

  it('summary references next actions when populated', () => {
    const r = synthesizeReport(base({ role: 'engineering_manager', open_tasks: 3, completed_tasks_7d: 1 }))
    expect(r.summary.length).toBeGreaterThan(20)
    expect(r.summary).toMatch(/下一步/)
  })

  it('confidence stays in [0.2, 0.95]', () => {
    const r = synthesizeReport(base({
      role: 'engineering_manager', failed_runs_24h: 99,
      blocked_tasks: 99, pending_ceo_approvals: 99,
    }))
    expect(r.confidence_score).toBeGreaterThanOrEqual(0.2)
    expect(r.confidence_score).toBeLessThanOrEqual(0.95)
  })

  it('metrics block echoes the input aggregates', () => {
    const r = synthesizeReport(base({
      open_tasks: 4, blocked_tasks: 1, completed_tasks_7d: 2,
      failed_runs_24h: 0, growth_running: 1,
    }))
    expect(r.metrics).toMatchObject({
      open_tasks: 4, blocked_tasks: 1, completed_tasks_7d: 2,
      growth_running: 1,
    })
  })
})
