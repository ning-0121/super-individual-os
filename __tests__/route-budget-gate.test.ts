import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Anthropic so we can assert it is NEVER called when over budget.
const createMock = vi.hoisted(() => vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] })))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMock } } }))

// Mock the server supabase client: an authed user + a model_runs query that
// reports $200 spent this month (over the default $100 cap → critical).
const sb = vi.hoisted(() => {
  const overBudgetRows = [{ cost_usd_estimated: 200, created_at: new Date().toISOString() }]
  function from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b; b.eq = () => b; b.gte = () => b; b.limit = () => b; b.order = () => b
    b.insert = () => b
    b.single = () => Promise.resolve({ data: {}, error: null })
    b.maybeSingle = () => Promise.resolve({ data: {}, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (resolve: any) => resolve({ data: table === 'model_runs' ? overBudgetRows : [], error: null })
    return b
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from,
  }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }))

beforeEach(() => { createMock.mockClear(); delete process.env.COST_HARD_CAP; delete process.env.COST_MONTHLY_WARN_USD })

describe('/api/orchestrate budget gate (P1-1)', () => {
  it('returns 402 and does NOT call the model when over budget', async () => {
    const { POST } = await import('@/app/api/orchestrate/route')
    const res = await POST(new Request('http://x/api/orchestrate', {
      method: 'POST', body: JSON.stringify({ projectId: 'p1', goal: 'g' }),
    }))
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.code).toBe('budget_exceeded')
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('/api/avatar/state budget gate (P1-1)', () => {
  it('returns 402 and does NOT call the model when over budget', async () => {
    const { POST } = await import('@/app/api/avatar/state/route')
    const res = await POST(new Request('http://x/api/avatar/state', {
      method: 'POST', body: JSON.stringify({ text: 'hi' }),
    }))
    expect(res.status).toBe(402)
    expect(createMock).not.toHaveBeenCalled()
  })
})
