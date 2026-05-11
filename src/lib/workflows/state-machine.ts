// ─────────────────────────────────────────────────
// V2.8 — Workflow Runtime — pure deterministic state machine
// All transitions are pure functions. Side effects (insert tasks,
// audit log, notify) are emitted as `intents[]` for the runtime
// orchestrator to execute. This keeps the FSM fully testable.
// ─────────────────────────────────────────────────

// ── States ────────────────────────────────────────
export type RunStatus =
  | 'pending'             // not started
  | 'running'             // at least one step actively progressing
  | 'blocked_approval'    // a step is waiting on approval
  | 'succeeded'           // all steps done
  | 'failed'              // unrecoverable
  | 'cancelled'           // manually stopped

export type StepRunStatus =
  | 'waiting'             // deps not satisfied
  | 'ready'               // deps satisfied, awaiting dispatch
  | 'running'
  | 'blocked_approval'
  | 'succeeded'
  | 'failed'              // tried max_attempts, no recovery
  | 'escalated'           // failed AND escalated to a manager
  | 'skipped'             // bypassed (e.g. parent failed)

// ── Events ────────────────────────────────────────
export type StepEvent =
  | { kind: 'dependencies_met' }
  | { kind: 'dispatch' }                                 // ready → running
  | { kind: 'gate_approval' }                            // running → blocked_approval
  | { kind: 'approval_granted' }                         // blocked_approval → running
  | { kind: 'approval_rejected' }                        // blocked_approval → failed
  | { kind: 'complete' }                                 // running → succeeded
  | { kind: 'fail'; attempt: number; max_attempts: number }  // running → (running again | failed)
  | { kind: 'escalate' }                                 // failed → escalated
  | { kind: 'skip' }                                     // any → skipped
  | { kind: 'cancel' }                                   // any → skipped

export type RunEvent =
  | { kind: 'start' }
  | { kind: 'tick'; step_statuses: StepRunStatus[] }
  | { kind: 'cancel' }

// ── Intents (side effects the runtime should perform) ──
export type Intent =
  | { kind: 'create_task'; step_key: string }
  | { kind: 'dispatch_unit'; step_key: string }
  | { kind: 'create_approval'; step_key: string; role?: string }
  | { kind: 'schedule_retry'; step_key: string; backoff_ms: number; next_attempt: number }
  | { kind: 'escalate_to_manager'; step_key: string; reason: string }
  | { kind: 'mark_run_status'; status: RunStatus }
  | { kind: 'append_activity'; activity_type: 'workflow_update'; title: string; metadata?: Record<string, unknown> }

// ── Step transition ───────────────────────────────
export interface StepInput {
  status: StepRunStatus
  step_key: string
  requires_approval?: boolean
  approval_role?: string
}

export interface StepTransition {
  next_status: StepRunStatus
  intents: Intent[]
  changed: boolean
}

export function transitionStep(input: StepInput, event: StepEvent): StepTransition {
  const { status, step_key } = input
  const intents: Intent[] = []

  switch (event.kind) {
    case 'dependencies_met': {
      if (status !== 'waiting') return same(status)
      return { next_status: 'ready', intents: [
        { kind: 'append_activity', activity_type: 'workflow_update', title: `step ${step_key} ready` },
      ], changed: true }
    }

    case 'dispatch': {
      if (status !== 'ready') return same(status)
      // Gate the dispatch when approval is required up-front.
      if (input.requires_approval) {
        return {
          next_status: 'blocked_approval',
          intents: [
            { kind: 'create_approval', step_key, role: input.approval_role },
            { kind: 'append_activity', activity_type: 'workflow_update',
              title: `step ${step_key} → blocked on approval` },
          ],
          changed: true,
        }
      }
      return {
        next_status: 'running',
        intents: [
          { kind: 'create_task', step_key },
          { kind: 'dispatch_unit', step_key },
          { kind: 'append_activity', activity_type: 'workflow_update',
            title: `step ${step_key} → running` },
        ],
        changed: true,
      }
    }

    case 'gate_approval': {
      if (status !== 'running') return same(status)
      return {
        next_status: 'blocked_approval',
        intents: [{ kind: 'create_approval', step_key, role: input.approval_role }],
        changed: true,
      }
    }

    case 'approval_granted': {
      if (status !== 'blocked_approval') return same(status)
      return {
        next_status: 'running',
        intents: [
          { kind: 'create_task', step_key },
          { kind: 'dispatch_unit', step_key },
          { kind: 'append_activity', activity_type: 'workflow_update',
            title: `step ${step_key} approved → running` },
        ],
        changed: true,
      }
    }

    case 'approval_rejected': {
      if (status !== 'blocked_approval') return same(status)
      return {
        next_status: 'failed',
        intents: [{ kind: 'append_activity', activity_type: 'workflow_update',
          title: `step ${step_key} rejected at gate` }],
        changed: true,
      }
    }

    case 'complete': {
      if (status !== 'running') return same(status)
      return {
        next_status: 'succeeded',
        intents: [{ kind: 'append_activity', activity_type: 'workflow_update',
          title: `step ${step_key} ✓ done` }],
        changed: true,
      }
    }

    case 'fail': {
      if (status !== 'running' && status !== 'ready') return same(status)
      // Apply retry policy: if attempt < max, schedule retry (stay in ready);
      // otherwise fail terminally and emit escalation intent.
      if (event.attempt < event.max_attempts) {
        const backoff = retryBackoffMs(event.attempt)
        return {
          next_status: 'ready',                          // re-queued
          intents: [
            { kind: 'schedule_retry', step_key, backoff_ms: backoff, next_attempt: event.attempt + 1 },
            { kind: 'append_activity', activity_type: 'workflow_update',
              title: `step ${step_key} failed, retry ${event.attempt + 1}/${event.max_attempts} in ${Math.round(backoff/1000)}s` },
          ],
          changed: true,
        }
      }
      return {
        next_status: 'failed',
        intents: [
          { kind: 'escalate_to_manager', step_key,
            reason: `Step exhausted ${event.max_attempts} attempts` },
          { kind: 'append_activity', activity_type: 'workflow_update',
            title: `step ${step_key} ✗ failed permanently` },
        ],
        changed: true,
      }
    }

    case 'escalate': {
      if (status !== 'failed') return same(status)
      return {
        next_status: 'escalated',
        intents: [{ kind: 'append_activity', activity_type: 'workflow_update',
          title: `step ${step_key} escalated to manager` }],
        changed: true,
      }
    }

    case 'skip':
    case 'cancel': {
      if (['succeeded','escalated','skipped'].includes(status)) return same(status)
      return {
        next_status: 'skipped',
        intents: [{ kind: 'append_activity', activity_type: 'workflow_update',
          title: `step ${step_key} ${event.kind === 'cancel' ? 'cancelled' : 'skipped'}` }],
        changed: true,
      }
    }
  }
}

function same(s: StepRunStatus): StepTransition {
  return { next_status: s, intents: [], changed: false }
}

// ── Run-level state derivation ────────────────────
export interface RunDerivedState {
  status: RunStatus
  bottleneck_step_key: string | null
  current_step_keys: string[]
  completed_step_keys: string[]
  failed_step_keys: string[]
  done: boolean
}

export interface StepSlice {
  step_key: string
  status: StepRunStatus
}

// Pure: given step statuses, derive the run's overall status + bottleneck.
export function deriveRunStatus(steps: StepSlice[], previous: RunStatus = 'pending'): RunDerivedState {
  if (steps.length === 0) {
    return {
      status: previous === 'cancelled' ? 'cancelled' : 'pending',
      bottleneck_step_key: null,
      current_step_keys: [], completed_step_keys: [], failed_step_keys: [],
      done: previous === 'cancelled',
    }
  }

  const completed_step_keys = steps.filter(s => s.status === 'succeeded' || s.status === 'skipped').map(s => s.step_key)
  const failed_step_keys = steps.filter(s => s.status === 'failed' || s.status === 'escalated').map(s => s.step_key)
  const running = steps.filter(s => s.status === 'running')
  const blockedApproval = steps.filter(s => s.status === 'blocked_approval')
  const current_step_keys = [...running, ...blockedApproval].map(s => s.step_key)
  const allDoneOrTerminal = steps.every(s =>
    ['succeeded','failed','escalated','skipped'].includes(s.status))

  let status: RunStatus
  let bottleneck: string | null = null

  if (previous === 'cancelled') {
    status = 'cancelled'
  } else if (allDoneOrTerminal) {
    // Any non-skipped failure → failed; else succeeded
    status = failed_step_keys.length > 0 ? 'failed' : 'succeeded'
    if (status === 'failed') bottleneck = failed_step_keys[0]
  } else if (blockedApproval.length > 0) {
    status = 'blocked_approval'
    bottleneck = blockedApproval[0].step_key
  } else if (running.length > 0) {
    status = 'running'
    bottleneck = running[0].step_key
  } else {
    // No running, no blocked, not all done — must be a waiting/ready mix
    const waiting = steps.find(s => s.status === 'waiting' || s.status === 'ready')
    status = waiting ? 'running' : 'pending'
    if (waiting) bottleneck = waiting.step_key
  }

  return {
    status,
    bottleneck_step_key: bottleneck,
    current_step_keys, completed_step_keys, failed_step_keys,
    done: status === 'succeeded' || status === 'failed' || status === 'cancelled',
  }
}

// ── Retry backoff (exponential w/ cap) ────────────
// Pure. attempts is the 0-indexed prior attempt count.
export function retryBackoffMs(attempts: number): number {
  const base = 30_000                    // 30s
  const cap  = 30 * 60_000               // 30min
  return Math.min(cap, base * Math.pow(2, attempts))
}
