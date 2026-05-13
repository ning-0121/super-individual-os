// ─────────────────────────────────────────────────
// V0.1 — Pure state transitions for local-agent tool_runs
// Used by POST /api/local-agent/result to decide whether to update
// and what the resulting update object should look like.
// ─────────────────────────────────────────────────

import { isReadOnlyAction } from './policy'

export type RunStatus = 'pending_approval' | 'success' | 'error' | 'blocked'

export interface PostedResult {
  posted_status: 'success' | 'error'
  result?: Record<string, unknown>
  error_message?: string
  duration_ms?: number
}

export type Transition =
  | { action: 'reject'; reason: string }
  | { action: 'idempotent'; current: 'success' | 'error' }
  | { action: 'update'; update: Record<string, unknown>; now: string }

export function nextRunTransition(
  row: { status: string; action: string },
  posted: PostedResult,
  now: Date = new Date(),
): Transition {
  // Defence in depth — verb must be read-only even on the result path.
  const verb = String(row.action).replace(/^local_agent\./, '')
  if (!isReadOnlyAction(verb)) {
    return { action: 'reject', reason: 'V0 only supports read-only local actions' }
  }
  if (row.status === 'success' || row.status === 'error') {
    return { action: 'idempotent', current: row.status }
  }
  if (row.status !== 'pending_approval') {
    return { action: 'reject', reason: `cannot transition from ${row.status}` }
  }
  if (posted.posted_status !== 'success' && posted.posted_status !== 'error') {
    return { action: 'reject', reason: 'posted_status must be success or error' }
  }

  const update: Record<string, unknown> = {
    status: posted.posted_status,
    finished_at: now.toISOString(),
  }
  if (posted.posted_status === 'success') {
    update.result = posted.result ?? {}
  } else {
    update.error_message = posted.error_message ?? 'unknown error'
  }
  if (typeof posted.duration_ms === 'number') update.duration_ms = posted.duration_ms

  return { action: 'update', update, now: update.finished_at as string }
}
