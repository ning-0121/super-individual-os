import { createClient } from '@/lib/supabase/server'
import { getEncryptionKeyStatus, ACTIVE_KEY_VERSION } from '@/lib/crypto'
import { isSentryConfigured } from '@/lib/error-reporter'

/**
 * Public health check endpoint — no auth required.
 * Used by Vercel monitoring / external uptime checks (UptimeRobot / Better Stack).
 *
 * Returns 200 healthy, 503 unhealthy. Never leaks user data.
 */
export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbLatency = -1

  try {
    const supabase = await createClient()
    const t0 = Date.now()
    // Lightweight read on a fixed small table; head=true means no rows shipped
    const { error } = await supabase
      .from('execution_units')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    dbLatency = Date.now() - t0
    dbOk = !error
  } catch {
    dbOk = false
  }

  const keyStatus = getEncryptionKeyStatus()
  const overall = dbOk && keyStatus.status !== 'invalid'

  const payload = {
    status: overall ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { ok: dbOk, latency_ms: dbLatency },
      encryption: { status: keyStatus.status, key_version: ACTIVE_KEY_VERSION },
      sentry: { configured: isSentryConfigured() },
    },
    uptime_check_ms: Date.now() - startedAt,
    version: 'v1.7',
  }

  return Response.json(payload, { status: overall ? 200 : 503 })
}
