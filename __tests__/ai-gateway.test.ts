import { describe, it, expect } from 'vitest'
import { estimateCostUSD, formatCostUSD } from '@/lib/ai/cost'
import { runWithFallback } from '@/lib/ai/ai-gateway'
import { makeMockAdapter } from '@/lib/ai/providers/mock'
import type { ProviderAdapter, ProviderInvokeInput } from '@/lib/ai/providers/types'

// ─────────────────────────────────────────────────
// Cost helper
// ─────────────────────────────────────────────────
describe('estimateCostUSD', () => {
  it('zero tokens → $0', () => {
    expect(estimateCostUSD({
      input_tokens: 0, output_tokens: 0,
      cost_input_usd_per_1m: 3, cost_output_usd_per_1m: 15,
    })).toBe(0)
  })

  it('1M input + 1M output at $3/$15 → $18', () => {
    expect(estimateCostUSD({
      input_tokens: 1_000_000, output_tokens: 1_000_000,
      cost_input_usd_per_1m: 3, cost_output_usd_per_1m: 15,
    })).toBe(18)
  })

  it('250k input + 50k output at Sonnet rates', () => {
    // (0.25 * 3) + (0.05 * 15) = 0.75 + 0.75 = 1.5
    expect(estimateCostUSD({
      input_tokens: 250_000, output_tokens: 50_000,
      cost_input_usd_per_1m: 3, cost_output_usd_per_1m: 15,
    })).toBe(1.5)
  })

  it('handles negative / nullish inputs gracefully', () => {
    expect(estimateCostUSD({
      input_tokens: -10, output_tokens: -5,
      cost_input_usd_per_1m: -1, cost_output_usd_per_1m: -2,
    })).toBe(0)
  })

  it('rounds to 6 decimal places', () => {
    // 100 input @ $3/M = 0.0003
    const r = estimateCostUSD({
      input_tokens: 100, output_tokens: 0,
      cost_input_usd_per_1m: 3, cost_output_usd_per_1m: 0,
    })
    expect(r).toBe(0.0003)
  })
})

describe('formatCostUSD', () => {
  it('zero → $0', () => { expect(formatCostUSD(0)).toBe('$0') })
  it('tiny → <$0.0001', () => { expect(formatCostUSD(0.00005)).toBe('<$0.0001') })
  it('typical → 4-decimal', () => { expect(formatCostUSD(0.1234)).toBe('$0.1234') })
})

// ─────────────────────────────────────────────────
// runWithFallback
// ─────────────────────────────────────────────────
describe('runWithFallback', () => {
  function makeAdapter(name: 'anthropic' | 'openai' | 'mock', behavior: 'ok' | 'fail' | 'unavailable'): ProviderAdapter {
    return {
      name,
      available: () => behavior !== 'unavailable',
      async invoke(input: ProviderInvokeInput) {
        if (behavior === 'fail') throw new Error(`${name} forced fail`)
        return {
          text: `${name}-ok`,
          input_tokens: 10, output_tokens: 20,
          model: input.model, provider: name,
          latency_ms: 5,
        }
      },
    }
  }

  it('primary OK → no fallback', async () => {
    const r = await runWithFallback(
      [makeAdapter('anthropic', 'ok'), makeAdapter('openai', 'ok')],
      'claude-sonnet-4-6', 'anthropic',
      { model: 'claude-sonnet-4-6', prompt: 'hi' },
    )
    expect(r.fallback_used).toBe(false)
    expect(r.result.provider).toBe('anthropic')
  })

  it('primary fails → falls back to second', async () => {
    const r = await runWithFallback(
      [makeAdapter('anthropic', 'fail'), makeAdapter('openai', 'ok')],
      'claude-sonnet-4-6', 'anthropic',
      { model: 'claude-sonnet-4-6', prompt: 'hi' },
    )
    expect(r.fallback_used).toBe(true)
    expect(r.result.provider).toBe('openai')
    expect(r.errors).toHaveLength(1)
  })

  it('primary unavailable → skipped', async () => {
    const r = await runWithFallback(
      [makeAdapter('anthropic', 'unavailable'), makeAdapter('openai', 'ok')],
      'claude-sonnet-4-6', 'anthropic',
      { model: 'claude-sonnet-4-6', prompt: 'hi' },
    )
    expect(r.fallback_used).toBe(true)
    expect(r.errors[0].error).toBe('unavailable')
  })

  it('all fail → throws', async () => {
    await expect(runWithFallback(
      [makeAdapter('anthropic', 'fail'), makeAdapter('openai', 'fail')],
      'claude-sonnet-4-6', 'anthropic',
      { model: 'claude-sonnet-4-6', prompt: 'hi' },
    )).rejects.toThrow(/All providers failed/)
  })

  it('uses modelByProvider override when present', async () => {
    const r = await runWithFallback(
      [makeAdapter('anthropic', 'fail'), makeAdapter('openai', 'ok')],
      'claude-sonnet-4-6', 'anthropic',
      { model: 'claude-sonnet-4-6', prompt: 'hi' },
      { openai: 'gpt-4o-mini' },
    )
    expect(r.result.model).toBe('gpt-4o-mini')
  })
})

// ─────────────────────────────────────────────────
// Mock adapter — sanity that stream() returns a usable iterable
// ─────────────────────────────────────────────────
describe('mockAdapter', () => {
  it('streams text chunks and finalizes', async () => {
    const adapter = makeMockAdapter({ prefix: 'X' })
    const s = await adapter.stream!({ model: 'mock-echo', prompt: 'hello world!' })
    let acc = ''
    for await (const c of s.stream) acc += c.text
    const stats = await s.finalize()
    expect(acc).toBe('X hello world!')
    expect(stats.full_text).toBe('X hello world!')
    expect(stats.output_tokens).toBeGreaterThan(0)
  })

  it('forceFail option throws on invoke', async () => {
    const adapter = makeMockAdapter({ forceFail: true })
    await expect(adapter.invoke({ model: 'mock-echo', prompt: 'x' }))
      .rejects.toThrow(/Mock provider forced failure/)
  })

  it('non-streaming invoke works', async () => {
    const adapter = makeMockAdapter({ prefix: '[m]' })
    const r = await adapter.invoke({ model: 'mock-echo', prompt: 'hi' })
    expect(r.text).toBe('[m] hi')
    expect(r.provider).toBe('mock')
  })
})
