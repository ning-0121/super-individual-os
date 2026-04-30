import { logger } from '@/lib/observability'
import * as crypto from 'crypto'

// ─────────────────────────────────────────────────
// V1.7 — Error reporter with optional Sentry HTTP ingest
// (no @sentry/nextjs SDK dep — direct HTTP POST to Sentry's store endpoint)
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

  // 1. Always log structured (Vercel logs / Logtail / etc. pick this up)
  logger.error('error.reported', {
    ...ctx,
    error_message: err.message,
    error_name: err.name,
    stack_preview: err.stack?.split('\n').slice(0, 6).join(' | ') ?? '',
  })

  // 2. Optionally forward to Sentry via HTTP (fire-and-forget)
  if (process.env.SENTRY_DSN) {
    forwardToSentry(err, ctx).catch(() => { /* never throw from reporter */ })
  }
}

export async function tryReport<T>(fn: () => Promise<T>, ctx: ErrorContext = {}): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    reportError(e, ctx)
    return null
  }
}

// ─────────────────────────────────────────────────
// Sentry HTTP ingest (minimal, no SDK)
// DSN format: https://<publicKey>@<host>/<projectId>
// Endpoint:   POST https://<host>/api/<projectId>/store/?sentry_key=<publicKey>&sentry_version=7
// ─────────────────────────────────────────────────
function parseDsn(dsn: string): { publicKey: string; host: string; projectId: string } | null {
  const m = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/)
  if (!m) return null
  return { publicKey: m[1], host: m[2], projectId: m[3] }
}

async function forwardToSentry(err: Error, ctx: ErrorContext): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  const parsed = parseDsn(dsn)
  if (!parsed) {
    logger.warn('sentry.dsn_invalid', { dsn_prefix: dsn.slice(0, 20) })
    return
  }

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    server_name: process.env.VERCEL_REGION ?? 'unknown',
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    exception: {
      values: [{
        type: err.name,
        value: err.message,
        stacktrace: {
          frames: parseStackFrames(err.stack ?? ''),
        },
      }],
    },
    extra: { ...ctx },
    tags: {
      user_id: ctx.user_id ?? 'anonymous',
      endpoint: ctx.endpoint ?? 'unknown',
      tool: ctx.tool ?? '',
    },
  }

  const url = `https://${parsed.host}/api/${parsed.projectId}/store/?sentry_key=${parsed.publicKey}&sentry_version=7`

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${parsed.publicKey},sentry_client=super-individual-os/1.0`,
      },
      body: JSON.stringify(event),
    })
  } catch (e) {
    // Don't recurse into reportError; just log
    logger.warn('sentry.send_fail', { error_message: e instanceof Error ? e.message : String(e) })
  }
}

function parseStackFrames(stack: string): Array<{ filename: string; function?: string; lineno?: number; colno?: number }> {
  const lines = stack.split('\n').slice(1, 12)  // skip first line (msg), cap at 12 frames
  const frames: Array<{ filename: string; function?: string; lineno?: number; colno?: number }> = []
  for (const line of lines) {
    // Match: "    at functionName (file:line:col)"  or  "    at file:line:col"
    const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (m) {
      frames.push({
        function: m[1] ?? undefined,
        filename: m[2],
        lineno: parseInt(m[3], 10),
        colno: parseInt(m[4], 10),
      })
    }
  }
  // Sentry expects oldest-first
  return frames.reverse()
}

export function isSentryConfigured(): boolean {
  return !!process.env.SENTRY_DSN && !!parseDsn(process.env.SENTRY_DSN)
}
