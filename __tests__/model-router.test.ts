import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { routeModel, listAvailableProviders } from '@/lib/ai/model-router'

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
