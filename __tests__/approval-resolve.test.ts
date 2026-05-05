import { describe, it, expect } from 'vitest'
import { resolveAllRequiredRoles } from '@/services/managers'
import { parseDispatchResponse } from '@/lib/managers/dispatch-response'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRequest, Manager } from '@/types'

// ─────────────────────────────────────────────────
// Mock Supabase client (thenable builders)
// ─────────────────────────────────────────────────
function mkBuilder(opts: {
  single?: () => unknown
  multi?: () => unknown[]
  insert?: (rows: unknown) => void
  update?: (cols: unknown) => void
}): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  b.select = () => b
  b.eq = () => b
  b.in = () => b
  b.order = () => b
  b.limit = () => b
  b.single = () => Promise.resolve({ data: opts.single?.() ?? null, error: null })
  b.maybeSingle = () => Promise.resolve({ data: opts.single?.() ?? null, error: null })
  b.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: opts.multi?.() ?? [], error: null })
  b.insert = (rows: unknown) => {
    opts.insert?.(rows)
    const inserted = Array.isArray(rows) ? rows[0] : rows
    return {
      select: () => ({ single: () => Promise.resolve({ data: inserted, error: null }) }),
    }
  }
  b.update = (cols: unknown) => {
    opts.update?.(cols)
    return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
  }
  return b
}

function mockClient(plan: {
  approval?: ApprovalRequest | null
  managersByRole?: Record<string, Manager>
  inserts: { table: string; rows: unknown }[]
  updates: { table: string; cols: unknown }[]
}): SupabaseClient {
  // Track which manager-by-role lookup is being requested
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const managerLookupQueue: any = { current: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mgrBuilder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    // .eq('role', X) is the discriminator we capture
    b.eq = (col: string, val: unknown) => {
      if (col === 'role') managerLookupQueue.current = String(val)
      return b
    }
    b.maybeSingle = () => {
      const role = managerLookupQueue.current as string | null
      managerLookupQueue.current = null
      const m = role ? plan.managersByRole?.[role] ?? null : null
      return Promise.resolve({ data: m, error: null })
    }
    return b
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => {
      switch (table) {
        case 'approval_requests':
          return mkBuilder({
            single: () => plan.approval ?? null,
            insert: (rows) => plan.inserts.push({ table, rows }),
            update: (cols) => plan.updates.push({ table, cols }),
          })
        case 'managers':
          return mgrBuilder()
        case 'manager_decisions':
          return mkBuilder({ insert: (rows) => plan.inserts.push({ table, rows }) })
        default:
          return mkBuilder({})
      }
    },
  } as unknown as SupabaseClient
}

function pendingRequest(opts: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'ar1', user_id: 'u1', project_id: 'p1', task_id: 't1', task_run_id: null,
    action_type: 'task.run', action_payload: { task_id: 't1' },
    risk_level: 2, required_approvers: ['engineering_manager'],
    approvers_acted: [], status: 'pending',
    classification_reason: 'github tool', expires_at: null, resolved_at: null,
    created_at: new Date().toISOString(),
    ...opts,
  }
}

function mgr(role: string): Manager {
  return {
    id: `mgr-${role}`, user_id: 'u1', project_id: 'p1',
    role: role as Manager['role'], domain: '',
    name: role, avatar: '🧑‍💼', description: '',
    authority_level: 3, system_prompt: '', is_active: true,
    created_at: '', updated_at: '',
  }
}

// ─────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────
describe('resolveAllRequiredRoles — approve path', () => {
  it('approves single-role request and writes one manager_decision', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({
      approval: pendingRequest(),
      managersByRole: { engineering_manager: mgr('engineering_manager') },
      inserts, updates,
    })

    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'approved', reason: 'lgtm',
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('approved')

    const decisionInserts = inserts.filter(i => i.table === 'manager_decisions')
    expect(decisionInserts.length).toBe(1)
    const dRow = decisionInserts[0].rows as Record<string, unknown>
    expect(dRow.decision_type).toBe('approve')
    expect(dRow.target_id).toBe('ar1')

    const update = updates.find(u => u.table === 'approval_requests')
    expect(update).toBeDefined()
    const cols = update!.cols as Record<string, unknown>
    expect(cols.status).toBe('approved')
    expect(cols.resolved_at).toBeDefined()
    expect((cols.approvers_acted as Array<unknown>).length).toBe(1)
  })

  it('approves multi-role request with one decision per role', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({
      approval: pendingRequest({
        risk_level: 3,
        required_approvers: ['engineering_manager', 'qa_manager'],
      }),
      managersByRole: {
        engineering_manager: mgr('engineering_manager'),
        qa_manager: mgr('qa_manager'),
      },
      inserts, updates,
    })

    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'approved',
    })

    expect(result.status).toBe('approved')
    const decisionInserts = inserts.filter(i => i.table === 'manager_decisions')
    expect(decisionInserts.length).toBe(2)
    const cols = updates[0].cols as Record<string, unknown>
    expect((cols.approvers_acted as Array<unknown>).length).toBe(2)
  })
})

describe('resolveAllRequiredRoles — reject path', () => {
  it('rejects request and does not mark approved', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({
      approval: pendingRequest({
        risk_level: 3,
        required_approvers: ['engineering_manager', 'qa_manager'],
      }),
      managersByRole: {
        engineering_manager: mgr('engineering_manager'),
        qa_manager: mgr('qa_manager'),
      },
      inserts, updates,
    })

    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'rejected', reason: 'no test coverage',
    })

    expect(result.status).toBe('rejected')
    const decisionInserts = inserts.filter(i => i.table === 'manager_decisions')
    expect(decisionInserts.length).toBe(2)
    expect((decisionInserts[0].rows as Record<string, unknown>).decision_type).toBe('reject')

    const cols = updates[0].cols as Record<string, unknown>
    expect(cols.status).toBe('rejected')
    expect(cols.resolved_at).toBeDefined()
  })
})

describe('resolveAllRequiredRoles — guards', () => {
  it('returns error when request not found', async () => {
    const sb = mockClient({ approval: null, inserts: [], updates: [] })
    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'approved',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('returns error when request is already resolved', async () => {
    const sb = mockClient({
      approval: pendingRequest({ status: 'approved' }),
      inserts: [], updates: [],
    })
    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'approved',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already/i)
  })

  it('returns error when a required manager is missing', async () => {
    const sb = mockClient({
      approval: pendingRequest({
        risk_level: 3,
        required_approvers: ['engineering_manager', 'qa_manager'],
      }),
      managersByRole: { engineering_manager: mgr('engineering_manager') },   // qa_manager missing
      inserts: [], updates: [],
    })
    const result = await resolveAllRequiredRoles(sb, {
      userId: 'u1', requestId: 'ar1', decision: 'approved',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/missing managers/i)
  })
})

// ─────────────────────────────────────────────────
// UI helper — parseDispatchResponse
// ─────────────────────────────────────────────────
describe('parseDispatchResponse — UI handler does not crash', () => {
  it('handles pending_approval', () => {
    const r = parseDispatchResponse({
      ok: true, dispatch: 'pending_approval',
      approval_id: 'ar1', risk_level: 2,
      required_approvers: ['engineering_manager'],
      classification_reason: 'github tool',
    })
    expect(r.kind).toBe('pending_approval')
    if (r.kind === 'pending_approval') {
      expect(r.approval_id).toBe('ar1')
      expect(r.risk_level).toBe(2)
      expect(r.required_approvers).toContain('engineering_manager')
    }
  })

  it('handles task_run_id (success)', () => {
    const r = parseDispatchResponse({ ok: true, task_run_id: 'tr_42' })
    expect(r.kind).toBe('navigate')
    if (r.kind === 'navigate') expect(r.url).toBe('/task-runs/tr_42')
  })

  it('handles concurrent_run', () => {
    const r = parseDispatchResponse({ existing_run_id: 'tr_old' })
    expect(r.kind).toBe('concurrent_run')
  })

  it('handles dependency block', () => {
    const r = parseDispatchResponse({
      blocked_by: [{ id: 't1', title: 'A', status: 'planned' }],
    })
    expect(r.kind).toBe('blocked_by_deps')
  })

  it('handles error string', () => {
    const r = parseDispatchResponse({ error: 'something' })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toBe('something')
  })

  it('handles error object {code,message}', () => {
    const r = parseDispatchResponse({ error: { code: 'x', message: 'oops' } })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toBe('oops')
  })

  it('handles undefined / null / non-object gracefully', () => {
    expect(parseDispatchResponse(null).kind).toBe('noop')
    expect(parseDispatchResponse(undefined).kind).toBe('noop')
    expect(parseDispatchResponse('foo').kind).toBe('noop')
    expect(parseDispatchResponse(42).kind).toBe('noop')
  })

  it('does not throw on malformed pending_approval', () => {
    expect(() => parseDispatchResponse({ dispatch: 'pending_approval' })).not.toThrow()
    expect(() => parseDispatchResponse({ dispatch: 'pending_approval', approval_id: 123 })).not.toThrow()
  })
})

// ─────────────────────────────────────────────────
// Approval list payload shape
// ─────────────────────────────────────────────────
describe('approval list shape', () => {
  it('approval row carries required fields for UI', () => {
    // This documents the expected shape from GET /api/approval-requests
    const sample = {
      id: 'ar1', user_id: 'u1', project_id: 'p1',
      project_name: 'My Project', task_title: 'Add X', task_id: 't1',
      action_type: 'task.run', risk_level: 2,
      required_approvers: ['engineering_manager'],
      status: 'pending', classification_reason: 'github tool',
      created_at: new Date().toISOString(),
    }
    expect(sample.status).toBe('pending')
    expect(sample.required_approvers.length).toBeGreaterThan(0)
    expect(sample.risk_level).toBeGreaterThanOrEqual(2)
    // UI groups by required_approvers[0]
    const group = sample.required_approvers.includes('ceo') ? 'ceo'
      : sample.required_approvers.includes('qa_manager') ? 'qa' : 'manager'
    expect(group).toBe('manager')
  })
})
