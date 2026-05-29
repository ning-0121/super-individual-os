import { describe, it, expect } from 'vitest'
import {
  buildDailyDigest, classifyDigestSeverity, shouldSendDigestNow,
  type DigestInput,
} from '@/lib/notify/digest'

const base: DigestInput = {
  date_label: '2026-05-13',
  pending_approvals: 0,
  blocked_workflows: 0,
  failed_runs_24h: 0,
  manager_interventions: 0,
  today_cost_usd: 0,
  reports_generated_today: 5,
  budget_critical: false,
}

describe('classifyDigestSeverity', () => {
  it('calm when nothing needs the human', () => {
    expect(classifyDigestSeverity(base)).toBe('calm')
  })
  it('attention when only approvals pending', () => {
    expect(classifyDigestSeverity({ ...base, pending_approvals: 3 })).toBe('attention')
  })
  it('urgent on failed runs', () => {
    expect(classifyDigestSeverity({ ...base, failed_runs_24h: 1 })).toBe('urgent')
  })
  it('urgent on blocked workflows', () => {
    expect(classifyDigestSeverity({ ...base, blocked_workflows: 2 })).toBe('urgent')
  })
  it('urgent on manager intervention', () => {
    expect(classifyDigestSeverity({ ...base, manager_interventions: 1 })).toBe('urgent')
  })
  it('urgent on budget critical', () => {
    expect(classifyDigestSeverity({ ...base, budget_critical: true })).toBe('urgent')
  })
  it('urgent dominates pending', () => {
    expect(classifyDigestSeverity({ ...base, pending_approvals: 9, failed_runs_24h: 1 })).toBe('urgent')
  })
})

describe('buildDailyDigest', () => {
  it('calm digest reassures + shows footer stats', () => {
    const d = buildDailyDigest(base)
    expect(d.severity).toBe('calm')
    expect(d.title).toMatch(/一切平稳/)
    expect(d.text).toMatch(/没有待办/)
    expect(d.text).toMatch(/今日 AI 成本 \$0/)
    expect(d.text).toMatch(/自动生成 5 份日报/)
  })

  it('attention digest headlines the approval count', () => {
    const d = buildDailyDigest({ ...base, pending_approvals: 4 })
    expect(d.severity).toBe('attention')
    expect(d.title).toMatch(/4 项待你审批/)
    expect(d.lines.some(l => l.includes('4 项待审批'))).toBe(true)
  })

  it('urgent digest lists every action item', () => {
    const d = buildDailyDigest({
      ...base,
      manager_interventions: 2,
      blocked_workflows: 1,
      failed_runs_24h: 3,
      pending_approvals: 5,
      budget_critical: true,
      today_cost_usd: 12.5,
    })
    expect(d.severity).toBe('urgent')
    const joined = d.lines.join('\n')
    expect(joined).toMatch(/2 份经理报告/)
    expect(joined).toMatch(/1 个 workflow 卡/)
    expect(joined).toMatch(/3 次执行失败/)
    expect(joined).toMatch(/5 项待审批/)
    expect(joined).toMatch(/成本已触顶/)
    expect(joined).toMatch(/\$12\.50/)
  })

  it('formats sub-cent cost as <$0.01', () => {
    const d = buildDailyDigest({ ...base, today_cost_usd: 0.003 })
    expect(d.text).toMatch(/<\$0\.01/)
  })

  it('markdown uses bullets and bold title', () => {
    const d = buildDailyDigest({ ...base, pending_approvals: 1 })
    expect(d.markdown).toMatch(/^\*.*\*/)
    expect(d.markdown).toMatch(/• /)
  })
})

describe('shouldSendDigestNow', () => {
  it('true only at the target UTC hour', () => {
    const at8 = new Date('2026-05-13T08:30:00Z')
    expect(shouldSendDigestNow(at8, 8)).toBe(true)
    expect(shouldSendDigestNow(at8, 9)).toBe(false)
  })
  it('clamps out-of-range hours to [0,23]', () => {
    const at0  = new Date('2026-05-13T00:05:00Z')
    const at23 = new Date('2026-05-13T23:05:00Z')
    expect(shouldSendDigestNow(at0, -5)).toBe(true)    // -5 clamps to 0, now is hour 0
    expect(shouldSendDigestNow(at23, 99)).toBe(true)   // 99 clamps to 23, now is hour 23
    expect(shouldSendDigestNow(at0, 99)).toBe(false)   // clamps to 23, now is hour 0
  })
  it('defaults to hour 8 on NaN', () => {
    const at8 = new Date('2026-05-13T08:00:00Z')
    expect(shouldSendDigestNow(at8, NaN)).toBe(true)
  })
})
