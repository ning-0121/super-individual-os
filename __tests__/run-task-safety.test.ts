import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────
// Isolate run-task from the real gateway / tools / error sink.
// runAgentLoop is the LLM+tool spender — we make it throw or succeed on demand.
// ─────────────────────────────────────────────────
const runAgentLoopMock = vi.fn()
vi.mock('@/lib/ai/gateway', () => ({
  runAgentLoop: (...args: unknown[]) => runAgentLoopMock(...args),
  runQAEvaluation: vi.fn(async () => null),
}))
vi.mock('@/lib/tools/router', () => ({
  getUserConnectedTools: vi.fn(async () => [] as string[]),
}))
vi.mock('@/lib/error-reporter', () => ({ reportError: vi.fn() }))

import { executeTaskRun } from '@/lib/ai/run-task'

// ─────────────────────────────────────────────────
// Recording Supabase mock — captures inserts/updates so we can assert on
// state transitions, and can enforce user_id scoping like RLS does.
// ─────────────────────────────────────────────────
interface Plan {
  owner: string
  taskRow?: unknown
  agentRow?: unknown
  projectRow?: unknown
  activeRuns?: unknown[]
  depTasks?: unknown[]
  budgetRows?: Array<{ cost_usd_estimated: number; created_at: string }>
  enforceUserScope?: boolean
}
interface Rec {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>
  updates: Array<{ table: string; payload: Record<string, unknown> }>
}

function singleFor(table: string, plan: Plan): unknown {
  switch (table) {
    case 'tasks':            return plan.taskRow ?? null
    case 'execution_units':  return plan.agentRow ?? null
    case 'projects':         return plan.projectRow ?? null
    default:                 return null
  }
}
function multiFor(table: string, plan: Plan): unknown[] {
  switch (table) {
    case 'task_runs':   return plan.activeRuns ?? []
    case 'tasks':       return plan.depTasks ?? []
    case 'model_runs':  return plan.budgetRows ?? []
    default:            return []
  }
}

function makeClient(plan: Plan): { client: SupabaseClient; rec: Rec } {
  const rec: Rec = { inserts: [], updates: [] }

  function builder(table: string) {
    const eqs: Array<[string, unknown]> = []
    let pendingInsert: Record<string, unknown> | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.eq = (col: string, val: unknown) => { eqs.push([col, val]); return b }
    b.in = () => b
    b.gte = () => b
    b.lt = () => b
    b.not = () => b
    b.order = () => b
    b.limit = () => b
    b.delete = () => b

    const scopeOk = () => {
      if (!plan.enforceUserScope) return true
      const u = eqs.find(([c]) => c === 'user_id')
      return !u || u[1] === plan.owner
    }

    b.single = () => {
      if (pendingInsert) {
        return Promise.resolve({ data: { id: `${table}-1`, ...pendingInsert }, error: null })
      }
      const data = scopeOk() ? singleFor(table, plan) : null
      return Promise.resolve({ data, error: data ? null : { message: 'not found' } })
    }
    b.maybeSingle = () =>
      Promise.resolve({ data: scopeOk() ? singleFor(table, plan) : null, error: null })

    b.insert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const first = Array.isArray(payload) ? payload[0] : payload
      rec.inserts.push({ table, payload: first })
      pendingInsert = first
      return b
    }
    b.update = (payload: Record<string, unknown>) => {
      rec.updates.push({ table, payload })
      return b
    }
    // Thenable: `await query...` resolves here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (resolve: any) =>
      resolve({ data: scopeOk() ? multiFor(table, plan) : [], error: null })
    return b
  }

  return {
    client: { from: (t: string) => builder(t) } as unknown as SupabaseClient,
    rec,
  }
}

const baseTask = {
  id: 't1', user_id: 'u1', execution_unit_id: 'a1', assigned_unit_id: 'a1',
  workflow_status: 'planned', context_payload: {}, project_id: null,
  title: 'Ship feature', description: 'do it', task_type: 'engineering',
}
const baseAgent = {
  id: 'a1', user_id: 'u1', type: 'agent', is_active: true,
  agent_type: 'engineering', name: 'Engineering', tools_allowed: [],
}

beforeEach(() => {
  runAgentLoopMock.mockReset()
  delete process.env.COST_HARD_CAP            // default = enabled
  delete process.env.COST_MONTHLY_WARN_USD    // default = 100
  delete process.env.COST_DAILY_WARN_USD      // default = 5
})

// ─────────────────────────────────────────────────
// 1. Cost hard-cap blocks run-task BEFORE any spend / dirty state
// ─────────────────────────────────────────────────
describe('run-task cost gate', () => {
  it('rejects execution when monthly budget is blown and creates NO task_run', async () => {
    const { client, rec } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [],
      // $150 this month vs default $100 cap → critical → blocked.
      budgetRows: [{ cost_usd_estimated: 150, created_at: new Date().toISOString() }],
    })

    const outcome = await executeTaskRun({ supabase: client, userId: 'u1', taskId: 't1' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok && 'error' in outcome) {
      expect(outcome.error.kind).toBe('budget_exceeded')
      if (outcome.error.kind === 'budget_exceeded') {
        expect(outcome.error.month_usd).toBeCloseTo(150, 1)
      }
    }
    // The LLM loop must never have been entered.
    expect(runAgentLoopMock).not.toHaveBeenCalled()
    // No task_run row was created — zero dirty state.
    expect(rec.inserts.some(i => i.table === 'task_runs')).toBe(false)
    // A rejection audit was written.
    expect(rec.inserts.some(i =>
      i.table === 'audit_logs' &&
      (i.payload.metadata as Record<string, unknown> | undefined)?.rejected === 'budget_exceeded',
    )).toBe(true)
  })

  it('allows execution when under budget', async () => {
    runAgentLoopMock.mockResolvedValue({
      total_steps: 1, tool_calls: [], final_output: 'done', steps: [],
    })
    const { client } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [],
      budgetRows: [],   // $0 spent
    })
    const outcome = await executeTaskRun({ supabase: client, userId: 'u1', taskId: 't1' })
    // Either ok, or fails downstream — but NOT for budget.
    if (!outcome.ok && 'error' in outcome) {
      expect(outcome.error.kind).not.toBe('budget_exceeded')
    }
    expect(runAgentLoopMock).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────
// 2. user_id scoping — a cross-tenant task is not runnable
// ─────────────────────────────────────────────────
describe('run-task tenancy (app-layer user_id scoping)', () => {
  it('refuses to run another user\'s task (task_not_found)', async () => {
    const { client, rec } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [],
      budgetRows: [], enforceUserScope: true,
    })
    // u2 tries to run u1's task.
    const outcome = await executeTaskRun({ supabase: client, userId: 'u2', taskId: 't1' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok && 'error' in outcome) {
      expect(outcome.error.kind).toBe('task_not_found')
    }
    // Nothing executed, nothing written.
    expect(runAgentLoopMock).not.toHaveBeenCalled()
    expect(rec.inserts.some(i => i.table === 'task_runs')).toBe(false)
  })

  it('the owner can run the same task', async () => {
    runAgentLoopMock.mockResolvedValue({ total_steps: 1, tool_calls: [], final_output: 'ok', steps: [] })
    const { client } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [],
      budgetRows: [], enforceUserScope: true,
    })
    const outcome = await executeTaskRun({ supabase: client, userId: 'u1', taskId: 't1' })
    if (!outcome.ok && 'error' in outcome) {
      expect(outcome.error.kind).not.toBe('task_not_found')
    }
    expect(runAgentLoopMock).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────
// 3. Failure rollback — a thrown agent loop leaves task_run = failed,
//    never stranded as 'running'
// ─────────────────────────────────────────────────
describe('run-task approval pause (P0-1)', () => {
  it('pending_approval from the agent loop → task_run blocked_approval, not executed/failed', async () => {
    runAgentLoopMock.mockResolvedValue({
      final_output: '', summary: 'paused', reasoning_summary: '', risks: [], next_steps: [],
      tool_calls: [], intermediate_steps: [], total_steps: 1,
      pending_approval: true,
      pending_approvals: [{ approval_id: 'appr1', capability_action: 'github.pr.create', tool: 'github', action: 'createPullRequest', risk_level: 2, required_approvers: ['engineering_manager', 'qa_manager'], reason: 'risk L2' }],
    })
    const { client, rec } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [], budgetRows: [],
    })

    const outcome = await executeTaskRun({ supabase: client, userId: 'u1', taskId: 't1' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok && 'blocked_approval' in outcome) {
      expect(outcome.blocked_approval).toBe(true)
      expect(outcome.pending_approvals[0].capability_action).toBe('github.pr.create')
    } else {
      throw new Error('expected blocked_approval outcome')
    }
    // task_run moved to blocked_approval (not completed/failed)
    const blocked = rec.updates.find(u => u.table === 'task_runs' && u.payload.run_status === 'blocked_approval')
    expect(blocked).toBeTruthy()
    // task marked blocked_approval
    expect(rec.updates.some(u => u.table === 'tasks' && u.payload.workflow_status === 'blocked_approval')).toBe(true)
  })
})

describe('run-task failure rollback', () => {
  it('marks task_run failed (not left running) when the agent loop throws', async () => {
    runAgentLoopMock.mockRejectedValue(new Error('gateway exploded'))
    const { client, rec } = makeClient({
      owner: 'u1', taskRow: baseTask, agentRow: baseAgent, activeRuns: [], budgetRows: [],
    })

    const outcome = await executeTaskRun({ supabase: client, userId: 'u1', taskId: 't1' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok && 'runtime_error' in outcome) {
      expect(outcome.runtime_error).toMatch(/gateway exploded/)
    }
    // task_run WAS created as running…
    const created = rec.inserts.find(i => i.table === 'task_runs')
    expect(created?.payload.run_status).toBe('running')
    // …then rolled forward to failed.
    const failedUpdate = rec.updates.find(u =>
      u.table === 'task_runs' && u.payload.run_status === 'failed')
    expect(failedUpdate).toBeTruthy()
    // and the task itself was marked blocked, not left in_progress.
    expect(rec.updates.some(u =>
      u.table === 'tasks' && u.payload.workflow_status === 'blocked')).toBe(true)
    // No task_run was left in 'running' as the terminal write.
    const lastTaskRunWrite = [...rec.updates].reverse()
      .find(u => u.table === 'task_runs')
    expect(lastTaskRunWrite?.payload.run_status).toBe('failed')
  })
})
