import { createClient } from '@/lib/supabase/server'
import { getEncryptionKeyStatus, ACTIVE_KEY_VERSION } from '@/lib/crypto'
import { listRegisteredTools } from '@/lib/tools/router'
import { isSentryConfigured } from '@/lib/error-reporter'
import { adminCount } from '@/lib/admin'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  // Encryption status — never returns raw key
  const keyStatus = getEncryptionKeyStatus()

  // Counts (in parallel)
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const since7d  = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [
    { count: connectedToolCount },
    { count: failedRuns24h },
    { count: succeededRuns7d },
    { count: auditLogCount },
    { data: recentFailures },
    { count: legacyTokenCount },
  ] = await Promise.all([
    supabase.from('tool_integrations').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('auth_status', 'connected').eq('is_active', true),
    supabase.from('task_runs').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('run_status', 'failed').gte('started_at', since24h),
    supabase.from('task_runs').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).in('run_status', ['succeeded', 'completed']).gte('started_at', since7d),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.from('task_runs').select('id, error_message, started_at, retry_count')
      .eq('user_id', user.id).eq('run_status', 'failed')
      .order('started_at', { ascending: false }).limit(5),
    // Legacy plaintext tokens (no enc:v1: prefix)
    supabase.from('tool_integrations').select('id, config', { count: 'exact', head: false })
      .eq('user_id', user.id),
  ])

  // Detect any plaintext-looking tokens
  type Integration = { id: string; config: Record<string, unknown> | null }
  const allIntegrations = (await supabase
    .from('tool_integrations').select('id, config').eq('user_id', user.id)).data as Integration[] | null

  let plaintextSecretCount = 0
  for (const t of (allIntegrations ?? [])) {
    const cfg = (t.config ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(cfg)) {
      if (/token|secret|password|api[-_]?key|service[-_]?role/i.test(k)
          && typeof v === 'string' && v.length > 0
          && !v.startsWith('enc:v')) {
        plaintextSecretCount++
      }
    }
  }

  // Compute launch blockers
  const blockers: Array<{ severity: 'critical' | 'warning'; message: string }> = []

  if (keyStatus.status === 'invalid') {
    blockers.push({ severity: 'critical', message: 'ENCRYPTION_KEY 未配置（生产环境敏感工具已禁用）' })
  } else if (keyStatus.status === 'dev-fallback' && process.env.NODE_ENV === 'production') {
    blockers.push({ severity: 'critical', message: '生产环境使用 dev fallback 密钥' })
  }

  if (plaintextSecretCount > 0) {
    blockers.push({
      severity: 'warning',
      message: `${plaintextSecretCount} 个明文 token 未加密（V1.5 之前遗留）— 重新保存即可加密`,
    })
  }

  if ((failedRuns24h ?? 0) >= 5) {
    blockers.push({
      severity: 'warning',
      message: `过去 24 小时内有 ${failedRuns24h} 次执行失败 — 请检查 Agent / 工具配置`,
    })
  }

  if ((connectedToolCount ?? 0) === 0) {
    blockers.push({ severity: 'warning', message: '尚未连接任何工具 — Agent 将无法执行真实动作' })
  }

  // Check if audit_logs table exists and has data (system has been used)
  const isFreshSystem = (auditLogCount ?? 0) === 0

  await audit(supabase, user.id, 'system.readiness_view')

  return Response.json({
    encryption: {
      ...keyStatus,
      active_key_version: ACTIVE_KEY_VERSION,
    },
    counts: {
      connected_tools: connectedToolCount ?? 0,
      registered_tools: listRegisteredTools().length,
      failed_runs_24h: failedRuns24h ?? 0,
      succeeded_runs_7d: succeededRuns7d ?? 0,
      audit_log_total: auditLogCount ?? 0,
      legacy_plaintext_secrets: plaintextSecretCount,
      admins: adminCount(),
    },
    integrations: {
      sentry_configured: isSentryConfigured(),
      health_endpoint: '/api/health',
    },
    recent_failures: (recentFailures ?? []).map(r => ({
      id: r.id,
      error_message: (r.error_message as string ?? '').slice(0, 200),
      started_at: r.started_at,
      retry_count: r.retry_count ?? 0,
    })),
    blockers,
    test_coverage: {
      unit_tests: 36,
      files: 5,
      note: 'Vitest @ npm test — V1.6 +integration tests for run-task gates',
    },
    is_fresh_system: isFreshSystem,
    generated_at: new Date().toISOString(),
  })
}
