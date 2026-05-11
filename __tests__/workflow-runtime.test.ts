import { describe, it, expect } from 'vitest'
import {
  transitionStep, deriveRunStatus, retryBackoffMs,
  type StepRunStatus, type StepEvent, type StepInput,
} from '@/lib/workflows/state-machine'
import {
  findNewlyReady, detectCycle, topoOrder, estimateEtaMs,
  type StepNode,
} from '@/lib/workflows/dag'

// ─────────────────────────────────────────────────
// Step state machine — every transition documented
// ─────────────────────────────────────────────────
function step(status: StepRunStatus, over: Partial<StepInput> = {}): StepInput {
  return { status, step_key: 's1', ...over }
}

describe('transitionStep', () => {
  it('waiting + dependencies_met → ready', () => {
    const t = transitionStep(step('waiting'), { kind: 'dependencies_met' })
    expect(t.next_status).toBe('ready')
    expect(t.changed).toBe(true)
    expect(t.intents.some(i => i.kind === 'append_activity')).toBe(true)
  })

  it('ready + dispatch (no approval) → running, emits create_task + dispatch_unit', () => {
    const t = transitionStep(step('ready'), { kind: 'dispatch' })
    expect(t.next_status).toBe('running')
    const kinds = t.intents.map(i => i.kind)
    expect(kinds).toContain('create_task')
    expect(kinds).toContain('dispatch_unit')
  })

  it('ready + dispatch (requires_approval) → blocked_approval', () => {
    const t = transitionStep(step('ready', { requires_approval: true, approval_role: 'ceo' }),
      { kind: 'dispatch' })
    expect(t.next_status).toBe('blocked_approval')
    expect(t.intents.find(i => i.kind === 'create_approval')).toBeTruthy()
    expect(t.intents.find(i => i.kind === 'create_task')).toBeFalsy()
  })

  it('running + gate_approval → blocked_approval', () => {
    const t = transitionStep(step('running', { approval_role: 'qa_manager' }),
      { kind: 'gate_approval' })
    expect(t.next_status).toBe('blocked_approval')
  })

  it('blocked_approval + approval_granted → running', () => {
    const t = transitionStep(step('blocked_approval'), { kind: 'approval_granted' })
    expect(t.next_status).toBe('running')
    expect(t.intents.some(i => i.kind === 'dispatch_unit')).toBe(true)
  })

  it('blocked_approval + approval_rejected → failed', () => {
    const t = transitionStep(step('blocked_approval'), { kind: 'approval_rejected' })
    expect(t.next_status).toBe('failed')
  })

  it('running + complete → succeeded', () => {
    const t = transitionStep(step('running'), { kind: 'complete' })
    expect(t.next_status).toBe('succeeded')
  })

  it('running + fail with attempts left → ready + schedule_retry', () => {
    const t = transitionStep(step('running'),
      { kind: 'fail', attempt: 0, max_attempts: 3 })
    expect(t.next_status).toBe('ready')
    const retry = t.intents.find(i => i.kind === 'schedule_retry')
    expect(retry).toBeTruthy()
    if (retry && retry.kind === 'schedule_retry') {
      expect(retry.next_attempt).toBe(1)
      expect(retry.backoff_ms).toBeGreaterThan(0)
    }
  })

  it('running + fail at max attempts → failed + escalate intent', () => {
    const t = transitionStep(step('running'),
      { kind: 'fail', attempt: 3, max_attempts: 3 })
    expect(t.next_status).toBe('failed')
    expect(t.intents.some(i => i.kind === 'escalate_to_manager')).toBe(true)
  })

  it('failed + escalate → escalated', () => {
    const t = transitionStep(step('failed'), { kind: 'escalate' })
    expect(t.next_status).toBe('escalated')
  })

  it('cancel from running → skipped', () => {
    const t = transitionStep(step('running'), { kind: 'cancel' })
    expect(t.next_status).toBe('skipped')
  })

  it('cancel on already terminal is no-op', () => {
    const t = transitionStep(step('succeeded'), { kind: 'cancel' })
    expect(t.changed).toBe(false)
    expect(t.next_status).toBe('succeeded')
  })

  it('dispatch on non-ready is no-op', () => {
    expect(transitionStep(step('waiting'), { kind: 'dispatch' }).changed).toBe(false)
    expect(transitionStep(step('running'), { kind: 'dispatch' }).changed).toBe(false)
  })

  it('complete on non-running is no-op', () => {
    expect(transitionStep(step('waiting'), { kind: 'complete' }).changed).toBe(false)
    expect(transitionStep(step('succeeded'), { kind: 'complete' }).changed).toBe(false)
  })
})

// ─────────────────────────────────────────────────
// Run-level state derivation
// ─────────────────────────────────────────────────
describe('deriveRunStatus', () => {
  it('empty workflow stays pending', () => {
    expect(deriveRunStatus([]).status).toBe('pending')
  })

  it('all succeeded → succeeded', () => {
    const r = deriveRunStatus([
      { step_key: 'a', status: 'succeeded' },
      { step_key: 'b', status: 'succeeded' },
    ])
    expect(r.status).toBe('succeeded')
    expect(r.done).toBe(true)
    expect(r.completed_step_keys).toEqual(['a', 'b'])
  })

  it('any non-skipped failure terminal → failed', () => {
    const r = deriveRunStatus([
      { step_key: 'a', status: 'succeeded' },
      { step_key: 'b', status: 'failed' },
    ])
    expect(r.status).toBe('failed')
    expect(r.bottleneck_step_key).toBe('b')
  })

  it('skipped failures still pass as succeeded if no real failures', () => {
    const r = deriveRunStatus([
      { step_key: 'a', status: 'succeeded' },
      { step_key: 'b', status: 'skipped' },
    ])
    expect(r.status).toBe('succeeded')
  })

  it('any running → status running, bottleneck on it', () => {
    const r = deriveRunStatus([
      { step_key: 'a', status: 'succeeded' },
      { step_key: 'b', status: 'running' },
      { step_key: 'c', status: 'waiting' },
    ])
    expect(r.status).toBe('running')
    expect(r.bottleneck_step_key).toBe('b')
    expect(r.current_step_keys).toContain('b')
  })

  it('any blocked_approval > running for bottleneck visibility', () => {
    const r = deriveRunStatus([
      { step_key: 'a', status: 'running' },
      { step_key: 'b', status: 'blocked_approval' },
    ])
    expect(r.status).toBe('blocked_approval')
    expect(r.bottleneck_step_key).toBe('b')
  })

  it('cancelled run stays cancelled regardless of step states', () => {
    const r = deriveRunStatus(
      [{ step_key: 'a', status: 'succeeded' }],
      'cancelled',
    )
    expect(r.status).toBe('cancelled')
    expect(r.done).toBe(true)
  })
})

// ─────────────────────────────────────────────────
// Retry backoff
// ─────────────────────────────────────────────────
describe('retryBackoffMs', () => {
  it('grows exponentially', () => {
    expect(retryBackoffMs(0)).toBe(30_000)
    expect(retryBackoffMs(1)).toBe(60_000)
    expect(retryBackoffMs(2)).toBe(120_000)
  })
  it('caps at 30 minutes', () => {
    expect(retryBackoffMs(10)).toBe(30 * 60_000)
    expect(retryBackoffMs(100)).toBe(30 * 60_000)
  })
})

// ─────────────────────────────────────────────────
// DAG helpers
// ─────────────────────────────────────────────────
describe('findNewlyReady', () => {
  const nodes: StepNode[] = [
    { step_key: 'a', depends_on: [] },
    { step_key: 'b', depends_on: ['a'] },
    { step_key: 'c', depends_on: ['a','b'] },
  ]

  it('roots are ready immediately', () => {
    const ready = findNewlyReady(nodes, [
      { step_key: 'a', status: 'waiting' },
      { step_key: 'b', status: 'waiting' },
      { step_key: 'c', status: 'waiting' },
    ])
    expect(ready).toEqual(['a'])
  })

  it('downstream unlocks after upstream succeeds', () => {
    const ready = findNewlyReady(nodes, [
      { step_key: 'a', status: 'succeeded' },
      { step_key: 'b', status: 'waiting' },
      { step_key: 'c', status: 'waiting' },
    ])
    expect(ready).toEqual(['b'])
  })

  it('skipped deps count as completed', () => {
    const ready = findNewlyReady(nodes, [
      { step_key: 'a', status: 'skipped' },
      { step_key: 'b', status: 'waiting' },
      { step_key: 'c', status: 'waiting' },
    ])
    expect(ready).toContain('b')
  })

  it('already-running steps are not reported again', () => {
    const ready = findNewlyReady(nodes, [
      { step_key: 'a', status: 'running' },
      { step_key: 'b', status: 'waiting' },
      { step_key: 'c', status: 'waiting' },
    ])
    expect(ready).toEqual([])
  })
})

describe('detectCycle + topoOrder', () => {
  it('linear DAG has no cycle and a valid topo order', () => {
    const nodes: StepNode[] = [
      { step_key: 'a', depends_on: [] },
      { step_key: 'b', depends_on: ['a'] },
      { step_key: 'c', depends_on: ['b'] },
    ]
    expect(detectCycle(nodes)).toBeNull()
    expect(topoOrder(nodes)).toEqual(['a','b','c'])
  })

  it('diamond DAG is acyclic', () => {
    const nodes: StepNode[] = [
      { step_key: 'a', depends_on: [] },
      { step_key: 'b', depends_on: ['a'] },
      { step_key: 'c', depends_on: ['a'] },
      { step_key: 'd', depends_on: ['b','c'] },
    ]
    expect(detectCycle(nodes)).toBeNull()
    const order = topoOrder(nodes)
    expect(order).not.toBeNull()
    if (order) {
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
    }
  })

  it('back-edge cycle is detected', () => {
    const nodes: StepNode[] = [
      { step_key: 'a', depends_on: ['c'] },
      { step_key: 'b', depends_on: ['a'] },
      { step_key: 'c', depends_on: ['b'] },
    ]
    const cyc = detectCycle(nodes)
    expect(cyc).not.toBeNull()
    expect(cyc!.length).toBeGreaterThanOrEqual(2)
    expect(topoOrder(nodes)).toBeNull()
  })

  it('self-loop is a cycle', () => {
    const nodes: StepNode[] = [{ step_key: 'a', depends_on: ['a'] }]
    expect(detectCycle(nodes)).not.toBeNull()
  })
})

describe('estimateEtaMs', () => {
  it('zero remaining → 0 ms', () => {
    expect(estimateEtaMs(0)).toBe(0)
  })
  it('scales with remaining / parallelism', () => {
    // 4 steps, 5min avg, 2 parallel → 4*5/2 = 10min = 600_000 ms
    expect(estimateEtaMs(4, 5 * 60_000, 2)).toBe(600_000)
  })
})
