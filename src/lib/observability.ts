// ─────────────────────────────────────────────────
// Structured logging + standard API error response
// ─────────────────────────────────────────────────
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  user_id?: string
  task_id?: string
  task_run_id?: string
  agent_id?: string
  agent_name?: string
  tool?: string
  duration_ms?: number
  status?: string
  retry_count?: number
  [k: string]: unknown
}

function emit(level: LogLevel, event: string, ctx: LogContext = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...ctx,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, ctx?: LogContext) => emit('debug', event, ctx),
  info:  (event: string, ctx?: LogContext) => emit('info',  event, ctx),
  warn:  (event: string, ctx?: LogContext) => emit('warn',  event, ctx),
  error: (event: string, ctx?: LogContext) => emit('error', event, ctx),
}

// Track an async operation with timing
export async function timeIt<T>(event: string, ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    const result = await fn()
    logger.info(event + '.ok', { ...ctx, duration_ms: Date.now() - t0 })
    return result
  } catch (e) {
    logger.error(event + '.fail', {
      ...ctx,
      duration_ms: Date.now() - t0,
      error_message: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

// ─────────────────────────────────────────────────
// Standard API error response
// ─────────────────────────────────────────────────
export interface ApiErrorOptions {
  status?: number
  code?: string
  detail?: unknown
}

export function apiError(message: string, opts: ApiErrorOptions = {}): Response {
  return Response.json({
    ok: false,
    error: {
      code: opts.code ?? 'internal_error',
      message,
      detail: opts.detail,
    },
  }, { status: opts.status ?? 500 })
}

export function apiOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...data }, init)
}
