import { describe, it, expect, afterEach } from 'vitest'
import {
  evaluateGuardrails, shouldBlockModelCall, isHardCapEnabled,
} from '@/lib/cost/guardrails'

const thresholds = { daily_warning_usd: 5, monthly_warning_usd: 100 }
const origHardCap = process.env.COST_HARD_CAP

afterEach(() => {
  if (origHardCap === undefined) delete process.env.COST_HARD_CAP
  else process.env.COST_HARD_CAP = origHardCap
})

describe('isHardCapEnabled', () => {
  it('defaults to enabled when unset', () => {
    delete process.env.COST_HARD_CAP
    expect(isHardCapEnabled()).toBe(true)
  })
  it('disabled only when exactly "0"', () => {
    expect(isHardCapEnabled({ COST_HARD_CAP: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(isHardCapEnabled({ COST_HARD_CAP: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(isHardCapEnabled({ COST_HARD_CAP: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('shouldBlockModelCall', () => {
  it('does not block when under budget (ok)', () => {
    const s = evaluateGuardrails(1, 10, thresholds)   // 20% / 10%
    expect(shouldBlockModelCall(s, { enforce: true }).blocked).toBe(false)
  })

  it('does not block at warning (80-99%)', () => {
    const s = evaluateGuardrails(4.5, 50, thresholds)  // daily 90% = warning
    expect(s.overall_level).toBe('warning')
    expect(shouldBlockModelCall(s, { enforce: true }).blocked).toBe(false)
  })

  it('blocks at critical (>=100%) when enforced — daily', () => {
    const s = evaluateGuardrails(6, 10, thresholds)    // daily 120% = critical
    const d = shouldBlockModelCall(s, { enforce: true })
    expect(d.blocked).toBe(true)
    expect(d.reason).toMatch(/今日/)
  })

  it('blocks at critical — monthly', () => {
    const s = evaluateGuardrails(1, 120, thresholds)   // monthly 120% = critical
    const d = shouldBlockModelCall(s, { enforce: true })
    expect(d.blocked).toBe(true)
    expect(d.reason).toMatch(/本月/)
  })

  it('never blocks when enforcement is off, even at critical', () => {
    const s = evaluateGuardrails(99, 999, thresholds)
    expect(s.overall_level).toBe('critical')
    expect(shouldBlockModelCall(s, { enforce: false }).blocked).toBe(false)
  })

  it('respects COST_HARD_CAP env when enforce not passed', () => {
    const s = evaluateGuardrails(99, 999, thresholds)
    process.env.COST_HARD_CAP = '0'
    expect(shouldBlockModelCall(s).blocked).toBe(false)
    process.env.COST_HARD_CAP = '1'
    expect(shouldBlockModelCall(s).blocked).toBe(true)
  })
})
