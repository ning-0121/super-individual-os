import { describe, it, expect } from 'vitest'
import {
  summarize, breakdownByModel, breakdownByStage, mostExpensiveModel,
  inWindow, startOfThisMonth, startOfThisWeekISO,
  type ModelRunRow,
} from '@/lib/cost/aggregate'
import { evaluateGuardrails, DEFAULT_GUARDRAILS } from '@/lib/cost/guardrails'

function row(over: Partial<ModelRunRow> = {}): ModelRunRow {
  return {
    provider: 'anthropic', model: 'claude-sonnet-4-6',
    agent_type: null, task_kind: 'engineering',
    input_tokens: 1000, output_tokens: 500,
    duration_ms: 1200, status: 'success',
    cost_usd_estimated: 0.01, fallback_used: false,
    created_at: new Date().toISOString(),
    ...over,
  }
}

// ─────────────────────────────────────────────────
// summarize
// ─────────────────────────────────────────────────
describe('summarize', () => {
  it('empty input → zero summary', () => {
    const s = summarize([])
    expect(s.calls).toBe(0)
    expect(s.cost_usd).toBe(0)
    expect(s.avg_latency_ms).toBe(0)
  })

  it('sums calls / cost / tokens', () => {
    const s = summarize([
      row({ cost_usd_estimated: 0.05, input_tokens: 1000, output_tokens: 500, duration_ms: 1000 }),
      row({ cost_usd_estimated: 0.03, input_tokens:  800, output_tokens: 200, duration_ms: 2000 }),
    ])
    expect(s.calls).toBe(2)
    expect(s.cost_usd).toBe(0.08)
    expect(s.prompt_tokens).toBe(1800)
    expect(s.completion_tokens).toBe(700)
    expect(s.avg_latency_ms).toBe(1500)
  })

  it('counts fallbacks and failures', () => {
    const s = summarize([
      row({ fallback_used: true }),
      row({ status: 'error' }),
      row({ fallback_used: true, status: 'error' }),
    ])
    expect(s.fallback_count).toBe(2)
    expect(s.failure_count).toBe(2)
  })

  it('handles negative / nullish cost gracefully', () => {
    const s = summarize([
      row({ cost_usd_estimated: 0 }),
      row({ cost_usd_estimated: -0.01 }),
    ])
    // -0.01 counted as-is (we don't sanitize in summarize; round to 6)
    expect(s.cost_usd).toBeCloseTo(-0.01, 6)
  })
})

// ─────────────────────────────────────────────────
// breakdownByModel
// ─────────────────────────────────────────────────
describe('breakdownByModel', () => {
  it('groups by provider+model and sorts by cost desc', () => {
    const rows = [
      row({ provider: 'anthropic', model: 'sonnet', cost_usd_estimated: 0.1, input_tokens: 100, output_tokens: 50, duration_ms: 1000 }),
      row({ provider: 'anthropic', model: 'sonnet', cost_usd_estimated: 0.1, input_tokens: 100, output_tokens: 50, duration_ms: 2000 }),
      row({ provider: 'openai',    model: 'gpt-4o', cost_usd_estimated: 0.05 }),
    ]
    const b = breakdownByModel(rows)
    expect(b).toHaveLength(2)
    expect(b[0].model).toBe('sonnet')
    expect(b[0].calls).toBe(2)
    expect(b[0].estimated_cost).toBe(0.2)
    expect(b[0].avg_latency).toBe(1500)
    expect(b[0].total_tokens).toBe(300)
    expect(b[1].model).toBe('gpt-4o')
  })

  it('counts fallback and failure per model', () => {
    const b = breakdownByModel([
      row({ model: 'a', fallback_used: true }),
      row({ model: 'a', status: 'error' }),
      row({ model: 'b' }),
    ])
    const a = b.find(x => x.model === 'a')!
    expect(a.fallback_count).toBe(1)
    expect(a.failure_count).toBe(1)
  })
})

// ─────────────────────────────────────────────────
// breakdownByStage
// ─────────────────────────────────────────────────
describe('breakdownByStage', () => {
  it('groups by task_kind, falls back to agent_type, then uncategorized', () => {
    const b = breakdownByStage([
      row({ task_kind: 'engineering' }),
      row({ task_kind: 'engineering' }),
      row({ task_kind: 'qa' }),
      row({ task_kind: null, agent_type: 'research' }),
      row({ task_kind: null, agent_type: null }),
    ])
    const stages = new Map(b.map(s => [s.stage, s.calls]))
    expect(stages.get('engineering')).toBe(2)
    expect(stages.get('qa')).toBe(1)
    expect(stages.get('research')).toBe(1)
    expect(stages.get('uncategorized')).toBe(1)
  })

  it('computes failure_rate per stage', () => {
    const b = breakdownByStage([
      row({ task_kind: 'qa', status: 'success' }),
      row({ task_kind: 'qa', status: 'error' }),
      row({ task_kind: 'qa', status: 'error' }),
    ])
    const qa = b.find(s => s.stage === 'qa')!
    expect(qa.failure_count).toBe(2)
    expect(qa.failure_rate).toBeCloseTo(2 / 3, 6)
  })

  it('sorts by cost desc', () => {
    const b = breakdownByStage([
      row({ task_kind: 'cheap',  cost_usd_estimated: 0.001 }),
      row({ task_kind: 'pricey', cost_usd_estimated: 0.5 }),
    ])
    expect(b[0].stage).toBe('pricey')
  })
})

// ─────────────────────────────────────────────────
// mostExpensiveModel
// ─────────────────────────────────────────────────
describe('mostExpensiveModel', () => {
  it('returns null on empty', () => {
    expect(mostExpensiveModel([])).toBeNull()
  })
  it('returns null when all costs are zero', () => {
    expect(mostExpensiveModel([row({ cost_usd_estimated: 0 })])).toBeNull()
  })
  it('picks highest-cost model', () => {
    const r = mostExpensiveModel([
      row({ model: 'a', cost_usd_estimated: 0.1 }),
      row({ model: 'b', cost_usd_estimated: 0.5 }),
      row({ model: 'c', cost_usd_estimated: 0.2 }),
    ])!
    expect(r.model).toBe('b')
  })
})

// ─────────────────────────────────────────────────
// inWindow + start helpers
// ─────────────────────────────────────────────────
describe('inWindow + start-of-* helpers', () => {
  it('inWindow keeps rows >= start and drops earlier ones', () => {
    // inWindow is a pure ISO-string comparison — TZ-independent.
    // Use an explicit boundary so the assertion never depends on machine TZ.
    const start = '2026-05-12T00:00:00Z'
    const out = inWindow(
      [
        row({ created_at: '2026-05-12T00:30:00Z' }), // after  start → kept
        row({ created_at: '2026-05-12T00:00:00Z' }), // == start     → kept (>=)
        row({ created_at: '2026-05-11T23:30:00Z' }), // before start → dropped
      ],
      start,
    )
    expect(out.length).toBe(2)
    expect(out.every(r => r.created_at >= start)).toBe(true)
  })

  it('startOfThisMonth returns day=1 00:00 of same month', () => {
    const fixed = new Date('2026-05-15T08:00:00Z')
    const m = new Date(startOfThisMonth(fixed))
    expect(m.getDate()).toBe(1)
  })

  it('startOfThisWeekISO returns a Monday', () => {
    // Sunday 2026-05-10 → should snap back to Monday 2026-05-04
    const sun = new Date('2026-05-10T12:00:00')
    const w = new Date(startOfThisWeekISO(sun))
    // 1 = Monday
    expect(w.getDay()).toBe(1)
  })
})

// ─────────────────────────────────────────────────
// Guardrails
// ─────────────────────────────────────────────────
describe('evaluateGuardrails', () => {
  const t = { daily_warning_usd: 5, monthly_warning_usd: 100 }

  it('clean state → ok / no banner', () => {
    const g = evaluateGuardrails(1, 10, t)
    expect(g.overall_level).toBe('ok')
    expect(g.banner_message).toBeUndefined()
  })

  it('daily warning at 80%', () => {
    const g = evaluateGuardrails(4, 10, t)   // daily 4/5 = 80%
    expect(g.daily_level).toBe('warning')
    expect(g.overall_level).toBe('warning')
    expect(g.banner_message).toMatch(/今日成本接近/)
  })

  it('monthly critical at 100+%', () => {
    const g = evaluateGuardrails(1, 120, t)
    expect(g.monthly_level).toBe('critical')
    expect(g.overall_level).toBe('critical')
    expect(g.banner_message).toMatch(/本月成本/)
  })

  it('worse-of-two wins', () => {
    const g = evaluateGuardrails(6, 50, t)
    // daily = critical (>5), monthly = ok (< 80%) → overall critical
    expect(g.overall_level).toBe('critical')
    expect(g.banner_message).toMatch(/今日成本/)
  })

  it('zero thresholds = always ok', () => {
    const g = evaluateGuardrails(99, 999, { daily_warning_usd: 0, monthly_warning_usd: 0 })
    expect(g.overall_level).toBe('ok')
  })

  it('DEFAULT_GUARDRAILS exports sensible defaults', () => {
    expect(DEFAULT_GUARDRAILS.daily_warning_usd).toBeGreaterThan(0)
    expect(DEFAULT_GUARDRAILS.monthly_warning_usd).toBeGreaterThan(0)
  })
})
