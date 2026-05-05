import { describe, it, expect, vi } from 'vitest'
import {
  createDefaultManagersForProject,
  createManagerDecision,
  createApprovalRequest,
  resolveApprovalRequest,
} from '@/services/managers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRequest, Manager } from '@/types'

// ─────────────────────────────────────────────────
// Lightweight thenable Supabase mock
// (mirrors the pattern used by check-run-gates tests)
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
    // .insert().select().single() chain
    const inserted = Array.isArray(rows) ? rows[0] : rows
    return {
      select: () => ({
        single: () => Promise.resolve({ data: inserted, error: null }),
      }),
    }
  }
  b.update = (cols: unknown) => {
    opts.update?.(cols)
    return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
  }
  return b
}

function mockClient(plan: {
  managersForProject?: Manager[]
  approvalRequest?: ApprovalRequest | null
  inserts: { table: string; rows: unknown }[]
  updates: { table: string; cols: unknown }[]
}): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => {
      switch (table) {
        case 'managers':
          return mkBuilder({
            multi: () => plan.managersForProject ?? [],
            insert: (rows) => plan.inserts.push({ table, rows }),
          })
        case 'approval_requests':
          return mkBuilder({
            single: () => plan.approvalRequest ?? null,
            insert: (rows) => plan.inserts.push({ table, rows }),
            update: (cols) => plan.updates.push({ table, cols }),
          })
        case 'manager_decisions':
          return mkBuilder({
            insert: (rows) => plan.inserts.push({ table, rows }),
          })
        default:
          return mkBuilder({})
      }
    },
  } as unknown as SupabaseClient
}

// ─────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────
describe('createDefaultManagersForProject', () => {
  it('inserts 7 default managers when none exist', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const sb = mockClient({ managersForProject: [], inserts, updates: [] })
    await createDefaultManagersForProject(sb, 'u1', 'p1')
    expect(inserts.length).toBe(1)
    expect(inserts[0].table).toBe('managers')
    const rows = inserts[0].rows as Array<Record<string, unknown>>
    expect(rows.length).toBe(7)
    const roles = rows.map(r => r.role)
    expect(roles).toContain('ceo')
    expect(roles).toContain('engineering_manager')
    expect(roles).toContain('qa_manager')
  })

  it('only inserts missing roles when partially seeded', async () => {
    const partial = [
      { role: 'ceo' } as Manager,
      { role: 'engineering_manager' } as Manager,
    ]
    const inserts: Array<{ table: string; rows: unknown }> = []
    const sb = mockClient({ managersForProject: partial, inserts, updates: [] })
    await createDefaultManagersForProject(sb, 'u1', 'p1')
    const rows = inserts[0].rows as Array<Record<string, unknown>>
    expect(rows.length).toBe(5)   // 7 - 2 already present
    const roles = rows.map(r => r.role)
    expect(roles).not.toContain('ceo')
    expect(roles).toContain('design_manager')
  })
})

describe('createManagerDecision', () => {
  it('inserts a decision row with correct fields', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const sb = mockClient({ inserts, updates: [] })
    await createManagerDecision(sb, {
      userId: 'u1', projectId: 'p1', managerId: 'mgr1',
      decisionType: 'approve', targetType: 'approval_request', targetId: 'ar1',
      reasoning: 'looks good',
    })
    expect(inserts.length).toBe(1)
    const row = inserts[0].rows as Record<string, unknown>
    expect(row.manager_id).toBe('mgr1')
    expect(row.decision_type).toBe('approve')
    expect(row.target_id).toBe('ar1')
    expect(row.reasoning).toBe('looks good')
  })
})

describe('createApprovalRequest', () => {
  it('creates a pending request with correct fields', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const sb = mockClient({ inserts, updates: [] })
    const result = await createApprovalRequest(sb, {
      userId: 'u1', projectId: 'p1', taskId: 't1',
      actionType: 'tool.github.createPullRequest',
      actionPayload: { repo: 'u/r' },
      riskLevel: 2,
      requiredApprovers: ['engineering_manager'],
      classificationReason: 'PR creation',
    })
    expect(result).not.toBeNull()
    const row = inserts[0].rows as Record<string, unknown>
    expect(row.status).toBe('pending')
    expect(row.risk_level).toBe(2)
    expect(row.required_approvers).toEqual(['engineering_manager'])
    expect(row.action_type).toBe('tool.github.createPullRequest')
  })
})

describe('resolveApprovalRequest', () => {
  function pendingRequest(opts: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
      id: 'ar1', user_id: 'u1', project_id: 'p1', task_id: 't1', task_run_id: null,
      action_type: 'tool.github.createPullRequest', action_payload: {},
      risk_level: 2, required_approvers: ['engineering_manager'],
      approvers_acted: [], status: 'pending',
      classification_reason: 'PR', expires_at: null, resolved_at: null,
      created_at: new Date().toISOString(),
      ...opts,
    }
  }

  it('approves and reaches "approved" when single required approver votes yes', async () => {
    const inserts: Array<{ table: string; rows: unknown }> = []
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({ approvalRequest: pendingRequest(), inserts, updates })

    const result = await resolveApprovalRequest(sb, {
      userId: 'u1', requestId: 'ar1', managerId: 'eng-mgr-1',
      role: 'engineering_manager', decision: 'approve',
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('approved')
    const update = updates.find(u => u.table === 'approval_requests')
    expect(update).toBeDefined()
    const cols = update!.cols as Record<string, unknown>
    expect(cols.status).toBe('approved')
    expect((cols.approvers_acted as Array<unknown>).length).toBe(1)
  })

  it('stays pending when one of multiple approvers votes', async () => {
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({
      approvalRequest: pendingRequest({
        risk_level: 3,
        required_approvers: ['engineering_manager', 'qa_manager'],
      }),
      inserts: [], updates,
    })
    const result = await resolveApprovalRequest(sb, {
      userId: 'u1', requestId: 'ar1', managerId: 'eng-mgr-1',
      role: 'engineering_manager', decision: 'approve',
    })
    expect(result.status).toBe('pending')
    const cols = updates[0].cols as Record<string, unknown>
    expect(cols.status).toBe('pending')
  })

  it('rejects immediately when any approver votes reject', async () => {
    const updates: Array<{ table: string; cols: unknown }> = []
    const sb = mockClient({
      approvalRequest: pendingRequest({
        risk_level: 3,
        required_approvers: ['engineering_manager', 'qa_manager'],
      }),
      inserts: [], updates,
    })
    const result = await resolveApprovalRequest(sb, {
      userId: 'u1', requestId: 'ar1', managerId: 'qa-mgr-1',
      role: 'qa_manager', decision: 'reject', reasoning: 'no test coverage',
    })
    expect(result.status).toBe('rejected')
  })

  it('rejects voting from a non-required role', async () => {
    const sb = mockClient({
      approvalRequest: pendingRequest({ required_approvers: ['engineering_manager'] }),
      inserts: [], updates: [],
    })
    const result = await resolveApprovalRequest(sb, {
      userId: 'u1', requestId: 'ar1', managerId: 'design-mgr-1',
      role: 'design_manager', decision: 'approve',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not in required approvers/)
  })

  it('rejects double-voting from same role', async () => {
    const sb = mockClient({
      approvalRequest: pendingRequest({
        required_approvers: ['engineering_manager', 'qa_manager'],
        approvers_acted: [{
          role: 'engineering_manager', manager_id: 'mgr1', decision: 'approve',
          ts: new Date().toISOString(),
        }],
      }),
      inserts: [], updates: [],
    })
    const result = await resolveApprovalRequest(sb, {
      userId: 'u1', requestId: 'ar1', managerId: 'mgr1',
      role: 'engineering_manager', decision: 'approve',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already voted/)
  })
})
