import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  routeModel, listAvailableProviders,
  ensureCallableChoice, isProviderImplemented,
  type ModelChoice,
} from '@/lib/ai/model-router'

const origOpenAI = process.env.OPENAI_API_KEY
const origGemini = process.env.GEMINI_API_KEY

afterAll(() => {
  if (origOpenAI === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = origOpenAI
  if (origGemini === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = origGemini
})

describe('model router — without OpenAI/Gemini', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY
  })

  it('engineering → Claude', () => {
    const r = routeModel({ agent_type: 'engineering' })
    expect(r.provider).toBe('anthropic')
  })

  it('qa → Claude', () => {
    expect(routeModel({ agent_type: 'qa' }).provider).toBe('anthropic')
  })

  it('code task_kind → Claude', () => {
    expect(routeModel({ task_kind: 'code' }).provider).toBe('anthropic')
  })

  it('research → Claude (no GPT key configured)', () => {
    expect(routeModel({ agent_type: 'research' }).provider).toBe('anthropic')
  })

  it('growth → Claude (no GPT key configured)', () => {
    expect(routeModel({ agent_type: 'growth' }).provider).toBe('anthropic')
  })

  it('listAvailableProviders only has anthropic', () => {
    expect(listAvailableProviders()).toEqual(['anthropic'])
  })
})

// NB: HAS_OPENAI / HAS_GEMINI are cached at module load. Per-test override
// would require dynamic re-import; documented limitation. The unconfigured-env
// suite above already verifies the conservative default routing.

describe('ensureCallableChoice — Gemini footgun guard', () => {
  it('marks anthropic + openai as implemented, gemini as not', () => {
    expect(isProviderImplemented('anthropic')).toBe(true)
    expect(isProviderImplemented('openai')).toBe(true)
    expect(isProviderImplemented('gemini')).toBe(false)
  })

  it('passes through an implemented choice unchanged', () => {
    const c: ModelChoice = { provider: 'anthropic', model: 'claude-x', reason: 'r' }
    expect(ensureCallableChoice(c)).toEqual(c)
    const o: ModelChoice = { provider: 'openai', model: 'gpt-x', reason: 'r' }
    expect(ensureCallableChoice(o)).toEqual(o)
  })

  it('degrades a gemini choice to anthropic without throwing', () => {
    const g: ModelChoice = { provider: 'gemini', model: 'gemini-1.5-pro', reason: 'multimodal' }
    const out = ensureCallableChoice(g)
    expect(out.provider).toBe('anthropic')
    expect(out.reason).toMatch(/gemini not implemented/i)
    expect(out.reason).toMatch(/multimodal/)   // preserves original reason
  })
})
