import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V1.6 — Audit log helper
// Best-effort; never throws (logging failure must not break business logic)
// ─────────────────────────────────────────────────

export type AuditEvent =
  // Tool integration
  | 'tool_integration.create' | 'tool_integration.update' | 'tool_integration.delete' | 'tool_integration.test'
  // Task run lifecycle
  | 'task_run.start' | 'task_run.succeeded' | 'task_run.failed' | 'task_run.cancelled' | 'task_run.retry'
  // Tool call inside a run
  | 'tool_call.executed'
  // Reviews
  | 'review.approved' | 'review.revision_required' | 'review.rejected'
  // Misc
  | 'auth.login_check' | 'system.readiness_view'

export interface AuditOpts {
  resource_type?: string
  resource_id?: string | null
  metadata?: Record<string, unknown>
}

export async function audit(
  supabase: SupabaseClient,
  userId: string,
  event_type: AuditEvent,
  opts: AuditOpts = {},
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      event_type,
      resource_type: opts.resource_type ?? '',
      resource_id: opts.resource_id ?? null,
      metadata: opts.metadata ?? {},
    })
    logger.info('audit', { user_id: userId, event_type, resource_id: opts.resource_id ?? undefined })
  } catch (e) {
    // Never let audit failure propagate
    logger.warn('audit.fail', {
      user_id: userId, event_type,
      error_message: e instanceof Error ? e.message : String(e),
    })
  }
}
