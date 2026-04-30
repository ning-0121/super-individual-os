import { describe, it, expect } from 'vitest'
import { checkRunGates } from '@/lib/ai/run-task'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────
// Lightweight Supabase mock — supports the chains used by checkRunGates:
//   .select().eq().eq().single()        → returns single row
//   .select().eq().in().limit()         → returns array (await on terminal)
//   .select().in()                      → returns array (await directly)
//   .select().eq().single()             → returns single row
// ─────────────────────────────────────────────────
function makeBuilder(getSingle: () => unknown, getMulti: () => unknown[]): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  b.select = () => b
  b.eq = () => b
  b.in = () => b
  b.not = () => b
  b.order = () => b
  b.limit = () => b
  b.single = () => {
    const data = getSingle()
    return Promise.resolve({ data, error: data ? null : { message: 'not found' } })
  }
  b.maybeSingle = () => Promise.resolve({ data: getSingle(), error: null })
  // Make builder thenable so `await query.in(...)` resolves to multi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (resolve: any) => resolve({ data: getMulti(), error: null })
  return b
}

interface MockPlan {
  taskRow?: unknown        // returned from tasks.single()
  agentRow?: unknown       // returned from execution_units.single()
  activeRuns?: unknown[]   // returned from task_runs.limit(1) await
  depTasks?: unknown[]     // returned from tasks.in() await
  projectRow?: unknown     // returned from projects.single()
}

function mockClient(plan: MockPlan): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from: (table: string) => {
      switch (table) {
        case 'tasks':
          return makeBuilder(() => plan.taskRow, () => plan.depTasks ?? [])
        case 'execution_units':
          return makeBuilder(() => plan.agentRow, () => [])
        case 'task_runs':
          return makeBuilder(() => null, () => plan.activeRuns ?? [])
        case 'projects':
          return makeBuilder(() => plan.projectRow, () => [])
        default:
          return makeBuilder(() => null, () => [])
      }
    },
  } as unknown as SupabaseClient
}

const baseTask = {
  id: 't1', user_id: 'u1', execution_unit_id: 'a1', assigned_unit_id: 'a1',
  workflow_status: 'planned', context_payload: {}, project_id: null,
}
const baseAgent = {
  id: 'a1', user_id: 'u1', type: 'agent', is_active: true,
  agent_type: 'engineering', name: 'Engineering',
}

describe('checkRunGates — V1.6 integration', () => {
  it('passes when all gates clear', async () => {
    const sb = mockClient({ taskRow: baseTask, agentRow: baseAgent, activeRuns: [], depTasks: [] })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(true)
    if (result.pass) {
      expect(result.task.id).toBe('t1')
      expect(result.agent.id).toBe('a1')
    }
  })

  it('blocks when task not found', async () => {
    const sb = mockClient({ taskRow: null })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) expect(result.error.kind).toBe('task_not_found')
  })

  it('blocks when no agent assigned', async () => {
    const sb = mockClient({
      taskRow: { ...baseTask, execution_unit_id: null, assigned_unit_id: null },
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) expect(result.error.kind).toBe('no_agent')
  })

  it('blocks when agent is human (cannot auto-run)', async () => {
    const sb = mockClient({
      taskRow: baseTask,
      agentRow: { ...baseAgent, type: 'human' },
      activeRuns: [],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) expect(result.error.kind).toBe('agent_human')
  })

  it('blocks when agent is inactive', async () => {
    const sb = mockClient({
      taskRow: baseTask,
      agentRow: { ...baseAgent, is_active: false },
      activeRuns: [],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) expect(result.error.kind).toBe('agent_inactive')
  })

  it('blocks when an active run already exists for the same task', async () => {
    const sb = mockClient({
      taskRow: baseTask,
      agentRow: baseAgent,
      activeRuns: [{ id: 'r-active', run_status: 'running' }],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) {
      expect(result.error.kind).toBe('concurrent_run')
      if (result.error.kind === 'concurrent_run') {
        expect(result.error.existing_run_id).toBe('r-active')
        expect(result.error.status).toBe('running')
      }
    }
  })

  it('blocks when dependencies are unmet', async () => {
    const sb = mockClient({
      taskRow: { ...baseTask, context_payload: { depends_on: ['dep1', 'dep2'] } },
      agentRow: baseAgent,
      activeRuns: [],
      depTasks: [
        { id: 'dep1', title: 'Research', workflow_status: 'planned' },     // BLOCKING
        { id: 'dep2', title: 'Design',   workflow_status: 'completed' },   // ok
      ],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(false)
    if (!result.pass) {
      expect(result.error.kind).toBe('dependencies_unmet')
      if (result.error.kind === 'dependencies_unmet') {
        expect(result.error.blocked_by).toHaveLength(1)
        expect(result.error.blocked_by[0].id).toBe('dep1')
        expect(result.error.blocked_by[0].status).toBe('planned')
      }
    }
  })

  it('passes when all dependencies are completed/approved', async () => {
    const sb = mockClient({
      taskRow: { ...baseTask, context_payload: { depends_on: ['dep1', 'dep2'] } },
      agentRow: baseAgent,
      activeRuns: [],
      depTasks: [
        { id: 'dep1', title: 'A', workflow_status: 'completed' },
        { id: 'dep2', title: 'B', workflow_status: 'approved' },
      ],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(true)
  })

  it('ignores invalid (non-string) entries in depends_on', async () => {
    const sb = mockClient({
      taskRow: { ...baseTask, context_payload: { depends_on: [42, null, 'dep1'] } },
      agentRow: baseAgent,
      activeRuns: [],
      depTasks: [{ id: 'dep1', title: 'X', workflow_status: 'completed' }],
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(true)
  })

  it('attaches project context when task has project_id and project exists', async () => {
    const sb = mockClient({
      taskRow: { ...baseTask, project_id: 'p1' },
      agentRow: baseAgent,
      activeRuns: [],
      projectRow: { name: 'My Project', goal_statement: 'Build X', description: 'Detail' },
    })
    const result = await checkRunGates(sb, 'u1', 't1')
    expect(result.pass).toBe(true)
    if (result.pass) {
      expect(result.projectContext).not.toBeNull()
      expect(result.projectContext?.name).toBe('My Project')
      expect(result.projectContext?.goal).toBe('Build X')
    }
  })
})
