import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V1.6 — Error reporter abstraction
// Wraps console + future Sentry / Logtail integration.
// Never re-throws; safe to call in any catch block.
// ─────────────────────────────────────────────────

export interface ErrorContext {
  user_id?: string
  endpoint?: string
  method?: string
  task_id?: string
  task_run_id?: string
  agent_id?: string
  tool?: string
  [k: string]: unknown
}

export function reportError(error: unknown, ctx: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error))

  logger.error('error.reported', {
    ...ctx,
    error_message: err.message,
    error_name: err.name,
    stack_preview: err.stack?.split('\n').slice(0, 6).join(' | ') ?? '',
  })

  // Future: Sentry / Logtail / Datadog integration
  // if (process.env.SENTRY_DSN) {
  //   const Sentry = await import('@sentry/nextjs')
  //   Sentry.captureException(err, { extra: ctx })
  // }
}

// Helper: wrap a block, report on error, return null
export async function tryReport<T>(fn: () => Promise<T>, ctx: ErrorContext = {}): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    reportError(e, ctx)
    return null
  }
}
