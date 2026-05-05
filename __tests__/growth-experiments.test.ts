import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_GROWTH_TASKS, summarizeWeeklyGrowth,
  createGrowthExperiment, getGrowthExperiments,
  updateGrowthExperimentResult, seedGrowthTasksForSystem,
} from '@/services/growth'
import type { GrowthExperiment } from '@/types'

// ─────────────────────────────────────────────────
// Pure helpers (no DB)
// ─────────────────────────────────────────────────
describe('DEFAULT_GROWTH_TASKS', () => {
  it('has exactly 6 default growth tasks per system', () => {
    expect(DEFAULT_GROWTH_TASKS).toHaveLength(6)
  })

  it('covers all required task names', () => {
    const names = DEFAULT_GROWTH_TASKS.map(t => t.name)
    expect(names).toContain('Market research')
    expect(names).toContain('Competitor scan')
    expect(names).toContain('Landing page plan')
    expect(names).toContain('Outreach plan')
    expect(names).toContain('Content plan')
    expect(names).toContain('Feedback collection')
  })

  it('every default has channel + target_metric + hypothesis', () => {
    for (const t of DEFAULT_GROWTH_TASKS) {
      expect(t.channel).toBeTruthy()
      expect(t.target_metric).toBeTruthy()
      expect(t.hypothesis.length).toBeGreaterThan(10)
    }
  })
})

describe('summarizeWeeklyGrowth', () => {
  function exp(over: Partial<GrowthExperiment>): GrowthExperiment {
    return {
      id: 'x', user_id: 'u', system_id: 's', project_id: null,
      name: 'e', hypothesis: '', channel: '', target_metric: '',
      baseline_value: '', current_value: '', target_value: '',
      status: 'planning', result_summary: '', next_action: '',
      started_at: null, ended_at: null,
      created_at: '', updated_at: '',
      ...over,
    }
  }

  it('handles empty list', () => {
    const r = summarizeWeeklyGrowth([])
    expect(r.total).toBe(0)
    expect(r.by_status.running).toBe(0)
    expect(r.active_channels).toEqual([])
    expect(r.next_actions).toEqual([])
  })

  it('counts by status + dedupes channels', () => {
    const r = summarizeWeeklyGrowth([
      exp({ status: 'running',   channel: 'cold-email' }),
      exp({ status: 'running',   channel: 'cold-email' }),
      exp({ status: 'planning',  channel: 'twitter' }),
      exp({ status: 'completed', channel: 'cold-email' }),
      exp({ status: 'aborted',   channel: '' }),
    ])
    expect(r.total).toBe(5)
    expect(r.by_status.running).toBe(2)
    expect(r.by_status.planning).toBe(1)
    expect(r.by_status.completed).toBe(1)
    expect(r.by_status.aborted).toBe(1)
    expect(r.active_channels.sort()).toEqual(['cold-email', 'twitter'])
  })

  it('only collects next_actions from non-terminal experiments', () => {
    const r = summarizeWeeklyGrowth([
      exp({ name: 'A', status: 'running',   next_action: 'send 50 emails' }),
      exp({ name: 'B', status: 'completed', next_action: 'archive' }),
      exp({ name: 'C', status: 'planning',  next_action: 'draft hypothesis' }),
    ])
    expect(r.next_actions.map(n => n.name).sort()).toEqual(['A', 'C'])
  })

  it('caps next_actions at 5', () => {
    const exps = Array.from({ length: 10 }, (_, i) =>
      exp({ name: `X${i}`, status: 'running', next_action: 'do it' }),
    )
    expect(summarizeWeeklyGrowth(exps).next_actions).toHaveLength(5)
  })
})

// ─────────────────────────────────────────────────
// CRUD tests with mock supabase client
// ─────────────────────────────────────────────────
function makeMockSupabase(rows: GrowthExperiment[] = [], opts: {
  insertError?: string; updateError?: string;
} = {}) {
  let lastInserted: unknown = null
  let lastUpdate: Record<string, unknown> | null = null

  const builder = {
    insert: vi.fn((payload: unknown) => {
      lastInserted = payload
      return {
        select: () => ({
          single: async () => opts.insertError
            ? { data: null, error: { message: opts.insertError } }
            : {
                data: Array.isArray(payload) ? payload[0] : payload,
                error: null,
              },
        }),
        // For seed (no .select): support direct await
        then: undefined,
      }
    }),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(async () => ({ data: rows, error: null })),
    update: vi.fn((patch: Record<string, unknown>) => {
      lastUpdate = patch
      return { eq: () => ({ eq: async () => opts.updateError
        ? { error: { message: opts.updateError } } : { error: null } }) }
    }),
  } as Record<string, unknown>

  // For seed which calls insert(rows) without .select(), make it await-able
  const insertAwaitable = vi.fn(async (payload: unknown) => {
    lastInserted = payload
    if (opts.insertError) return { error: { message: opts.insertError } }
    return { error: null }
  })

  const supa = {
    from: vi.fn(() => ({
      ...builder,
      insert: vi.fn((payload: unknown) => {
        lastInserted = payload
        // Return chainable for .select().single() (createGrowthExperiment)
        // but also works as awaited promise (seedGrowthTasksForSystem)
        const chain = {
          select: () => ({
            single: async () => opts.insertError
              ? { data: null, error: { message: opts.insertError } }
              : { data: Array.isArray(payload) ? payload[0] : payload, error: null },
          }),
          then: (resolve: (v: { error: { message: string } | null }) => unknown) => {
            return Promise.resolve(opts.insertError
              ? { error: { message: opts.insertError } }
              : { error: null }).then(resolve)
          },
        }
        return chain
      }),
    })),
    _getLastInsert: () => lastInserted,
    _getLastUpdate: () => lastUpdate,
    _insertAwaitable: insertAwaitable,
  }
  return supa as unknown as { from: ReturnType<typeof vi.fn>; _getLastInsert: () => unknown; _getLastUpdate: () => unknown }
}

describe('createGrowthExperiment', () => {
  it('rejects missing system_id or name', async () => {
    const supa = makeMockSupabase()
    expect(await createGrowthExperiment(supa as never, 'u1', { system_id: '', name: 'x' })).toBeNull()
    expect(await createGrowthExperiment(supa as never, 'u1', { system_id: 's1', name: '  ' })).toBeNull()
  })

  it('inserts with defaults filled', async () => {
    const supa = makeMockSupabase()
    const out = await createGrowthExperiment(supa as never, 'u1', {
      system_id: 's1', name: 'Test exp',
    })
    expect(out).toBeTruthy()
    const inserted = supa._getLastInsert() as Record<string, unknown>
    expect(inserted.user_id).toBe('u1')
    expect(inserted.system_id).toBe('s1')
    expect(inserted.name).toBe('Test exp')
    expect(inserted.status).toBe('planning')
    expect(inserted.hypothesis).toBe('')
    expect(inserted.channel).toBe('')
  })

  it('returns null on DB error', async () => {
    const supa = makeMockSupabase([], { insertError: 'unique violation' })
    expect(await createGrowthExperiment(supa as never, 'u1', {
      system_id: 's1', name: 'Test',
    })).toBeNull()
  })
})

describe('getGrowthExperiments', () => {
  it('returns rows from supabase', async () => {
    const rows = [
      { id: 'a', name: 'A', status: 'running' } as GrowthExperiment,
      { id: 'b', name: 'B', status: 'planning' } as GrowthExperiment,
    ]
    const supa = makeMockSupabase(rows)
    const out = await getGrowthExperiments(supa as never, 'u1')
    expect(out).toHaveLength(2)
  })
})

describe('updateGrowthExperimentResult', () => {
  it('sets started_at when transitioning to running', async () => {
    const supa = makeMockSupabase()
    const out = await updateGrowthExperimentResult(supa as never, 'u1', 'e1', {
      status: 'running',
    })
    expect(out.ok).toBe(true)
    const patch = supa._getLastUpdate() as Record<string, unknown>
    expect(patch.status).toBe('running')
    expect(patch.started_at).toBeTruthy()
  })

  it('sets ended_at when completing', async () => {
    const supa = makeMockSupabase()
    await updateGrowthExperimentResult(supa as never, 'u1', 'e1', {
      status: 'completed', result_summary: 'won', current_value: '12%',
    })
    const patch = supa._getLastUpdate() as Record<string, unknown>
    expect(patch.ended_at).toBeTruthy()
    expect(patch.result_summary).toBe('won')
    expect(patch.current_value).toBe('12%')
  })

  it('returns error from supabase', async () => {
    const supa = makeMockSupabase([], { updateError: 'forbidden' })
    const out = await updateGrowthExperimentResult(supa as never, 'u1', 'e1', { status: 'aborted' })
    expect(out.ok).toBe(false)
    expect(out.error).toBe('forbidden')
  })
})

describe('seedGrowthTasksForSystem', () => {
  it('creates exactly 6 default tasks', async () => {
    const supa = makeMockSupabase()
    const out = await seedGrowthTasksForSystem(supa as never, 'u1', 'sys-1')
    expect(out.ok).toBe(true)
    expect(out.created).toBe(6)
    const inserted = supa._getLastInsert() as Array<Record<string, unknown>>
    expect(inserted).toHaveLength(6)
    expect(inserted.every(r => r.system_id === 'sys-1' && r.user_id === 'u1' && r.status === 'planning')).toBe(true)
    const names = inserted.map(r => r.name)
    expect(names).toContain('Market research')
    expect(names).toContain('Feedback collection')
  })

  it('rejects empty systemId', async () => {
    const supa = makeMockSupabase()
    const out = await seedGrowthTasksForSystem(supa as never, 'u1', '')
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/systemId/i)
  })
})
