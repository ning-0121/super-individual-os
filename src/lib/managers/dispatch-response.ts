// ─────────────────────────────────────────────────
// Phase 2A — Pure parser for /api/tasks/[id]/run + /api/dispatch responses
// Used by Command Center / Tasks UI; testable without DOM.
// ─────────────────────────────────────────────────

export type DispatchUIAction =
  | { kind: 'navigate'; url: string }
  | { kind: 'pending_approval'; approval_id: string; risk_level: number; required_approvers: string[]; classification_reason: string }
  | { kind: 'concurrent_run'; existing_run_id: string }
  | { kind: 'blocked_by_deps'; blocked_by: Array<{ id: string; title: string; status: string }> }
  | { kind: 'error'; message: string }
  | { kind: 'noop' }

export function parseDispatchResponse(data: unknown): DispatchUIAction {
  if (!data || typeof data !== 'object') return { kind: 'noop' }
  const d = data as Record<string, unknown>

  // V2.0 — pending approval
  if (d.dispatch === 'pending_approval' && typeof d.approval_id === 'string') {
    return {
      kind: 'pending_approval',
      approval_id: d.approval_id,
      risk_level: typeof d.risk_level === 'number' ? d.risk_level : 2,
      required_approvers: Array.isArray(d.required_approvers) ? (d.required_approvers as string[]) : [],
      classification_reason: typeof d.classification_reason === 'string' ? d.classification_reason : '',
    }
  }

  // Successful run start
  if (typeof d.task_run_id === 'string') {
    return { kind: 'navigate', url: `/task-runs/${d.task_run_id}` }
  }

  // Concurrent run conflict
  if (typeof d.existing_run_id === 'string') {
    return { kind: 'concurrent_run', existing_run_id: d.existing_run_id }
  }

  // Dependency block
  if (Array.isArray(d.blocked_by)) {
    return {
      kind: 'blocked_by_deps',
      blocked_by: d.blocked_by as Array<{ id: string; title: string; status: string }>,
    }
  }

  // Generic error
  if (typeof d.error === 'string') return { kind: 'error', message: d.error }
  if (d.error && typeof (d.error as { message?: string }).message === 'string') {
    return { kind: 'error', message: (d.error as { message: string }).message }
  }

  return { kind: 'noop' }
}
