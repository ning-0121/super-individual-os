import { describe, it, expect } from 'vitest'
import { pickTodayCommand, type TodayInputs } from '@/lib/mission-control/today-command'

function base(over: Partial<TodayInputs> = {}): TodayInputs {
  return {
    ceo_pending_count: 0,
    critical_pending_count: 0,
    high_pending_count: 0,
    manager_intervention_count: 0,
    failed_runs_24h: 0,
    ...over,
  }
}

describe('pickTodayCommand — priority order', () => {
  it('critical approval beats everything', () => {
    const r = pickTodayCommand(base({
      critical_pending_count: 1,
      manager_intervention_count: 5,
      critical_project_id: 'p1', critical_project_name: 'P1',
      failed_runs_24h: 99,
    }))
    expect(r.kind).toBe('ceo_approval')
    expect(r.tone).toBe('critical')
    expect(r.primary_cta_href).toBe('/approvals')
  })

  it('CEO pending (non-critical) is ceo_approval warning', () => {
    const r = pickTodayCommand(base({ ceo_pending_count: 2 }))
    expect(r.kind).toBe('ceo_approval')
    expect(r.tone).toBe('warning')
  })

  it('critical project comes before manager_help', () => {
    const r = pickTodayCommand(base({
      critical_project_id: 'p1', critical_project_name: '内容工厂',
      critical_project_blockers: 3, critical_project_next_action: '上线 landing',
      manager_intervention_count: 1,
    }))
    expect(r.kind).toBe('critical_project')
    expect(r.primary_cta_href).toBe('/projects/p1')
    expect(r.detail).toMatch(/landing/)
    expect(r.top_risk).toMatch(/3 项阻塞/)
  })

  it('manager intervention picked when no critical project / approval', () => {
    const r = pickTodayCommand(base({
      manager_intervention_count: 2,
      manager_intervention_role: 'CTO',
      manager_intervention_summary: 'staging migration 卡住',
      manager_intervention_project_id: 'p9',
    }))
    expect(r.kind).toBe('manager_help')
    expect(r.headline).toMatch(/CTO/)
    expect(r.primary_cta_href).toBe('/projects/p9')
  })

  it('high-risk approval picked over failed_runs', () => {
    const r = pickTodayCommand(base({
      high_pending_count: 3,
      failed_runs_24h: 10,
    }))
    expect(r.kind).toBe('ceo_approval')
    expect(r.tone).toBe('warning')
  })

  it('failed_runs >= 5 surfaces when queue is clean', () => {
    const r = pickTodayCommand(base({ failed_runs_24h: 6 }))
    expect(r.kind).toBe('failed_runs')
    expect(r.primary_cta_href).toBe('/tools/autonomy')
  })

  it('failed_runs < 5 does NOT surface', () => {
    const r = pickTodayCommand(base({
      failed_runs_24h: 4,
      locked_project_id: 'L1', locked_project_next_action: 'ship landing',
    }))
    expect(r.kind).toBe('focus_action')
  })

  it('locked project focus_action when there is one', () => {
    const r = pickTodayCommand(base({
      locked_project_id: 'L1',
      locked_project_name: '内容工厂',
      locked_project_focus: '调研 IP',
      locked_project_next_action: '完成 5 个候选',
    }))
    expect(r.kind).toBe('focus_action')
    expect(r.tone).toBe('positive')
    expect(r.detail).toMatch(/完成 5 个候选/)
    expect(r.primary_cta_href).toBe('/projects/L1')
  })

  it('MUST task picked when no locked / no signals', () => {
    const r = pickTodayCommand(base({
      top_open_must_task_title: 'fix login regression',
    }))
    expect(r.kind).toBe('top_must_task')
    expect(r.primary_cta_href).toBe('/tasks')
  })

  it('truly idle → idle (positive tone, growth CTA)', () => {
    const r = pickTodayCommand(base({}))
    expect(r.kind).toBe('idle')
    expect(r.tone).toBe('positive')
    expect(r.primary_cta_href).toBe('/growth')
  })
})

describe('pickTodayCommand — user_action_count math', () => {
  it('sums CEO + manager + critical project', () => {
    const r = pickTodayCommand(base({
      ceo_pending_count: 2,
      manager_intervention_count: 1,
      critical_project_id: 'p1',
    }))
    expect(r.user_action_count).toBe(4)
  })
  it('zero when nothing pending', () => {
    expect(pickTodayCommand(base({})).user_action_count).toBe(0)
  })
})

describe('pickTodayCommand — output contract', () => {
  it('always has headline, detail, CTA, suggested_next', () => {
    const cases: TodayInputs[] = [
      base({}),
      base({ ceo_pending_count: 1 }),
      base({ critical_project_id: 'x' }),
      base({ manager_intervention_count: 3 }),
      base({ failed_runs_24h: 7 }),
      base({ top_open_must_task_title: 't' }),
      base({ locked_project_id: 'l', locked_project_next_action: 'n' }),
    ]
    for (const c of cases) {
      const r = pickTodayCommand(c)
      expect(r.headline.length).toBeGreaterThan(0)
      expect(r.detail.length).toBeGreaterThan(0)
      expect(r.primary_cta_label.length).toBeGreaterThan(0)
      expect(r.primary_cta_href).toMatch(/^\//)
      expect(r.suggested_next.length).toBeGreaterThan(0)
      expect(r.top_risk.length).toBeGreaterThan(0)
    }
  })

  it('headline truncation on long MUST title', () => {
    const long = 'x'.repeat(200)
    const r = pickTodayCommand(base({ top_open_must_task_title: long }))
    expect(r.headline.length).toBeLessThan(120)
  })
})
