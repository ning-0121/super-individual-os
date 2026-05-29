// ─────────────────────────────────────────────────
// V3.0 — Cost guardrails (pure, V1 = read-only warnings)
// Defaults can be overridden by env or stored per-user later.
// ─────────────────────────────────────────────────

export interface GuardrailThresholds {
  daily_warning_usd: number
  monthly_warning_usd: number
}

export const DEFAULT_GUARDRAILS: GuardrailThresholds = {
  daily_warning_usd:   Number(process.env.COST_DAILY_WARN_USD   ?? 5),
  monthly_warning_usd: Number(process.env.COST_MONTHLY_WARN_USD ?? 100),
}

export type GuardrailLevel = 'ok' | 'warning' | 'critical'

export interface GuardrailStatus {
  daily_level:    GuardrailLevel
  monthly_level:  GuardrailLevel
  overall_level:  GuardrailLevel
  daily_pct:      number   // 0..1.x — fraction of the threshold consumed
  monthly_pct:    number
  banner_message?: string  // human-readable headline when level != 'ok'
}

// Pure: given today/month cost and thresholds, decide level.
// - ok        : < 80% of threshold
// - warning   : >= 80%
// - critical  : >= 100%
export function evaluateGuardrails(
  todayUsd: number, monthUsd: number,
  thresholds: GuardrailThresholds = DEFAULT_GUARDRAILS,
): GuardrailStatus {
  const dPct = thresholds.daily_warning_usd > 0
    ? todayUsd / thresholds.daily_warning_usd : 0
  const mPct = thresholds.monthly_warning_usd > 0
    ? monthUsd / thresholds.monthly_warning_usd : 0

  function level(pct: number): GuardrailLevel {
    if (pct >= 1) return 'critical'
    if (pct >= 0.8) return 'warning'
    return 'ok'
  }
  const daily = level(dPct)
  const monthly = level(mPct)
  // overall = the worst of the two
  const order: Record<GuardrailLevel, number> = { ok: 0, warning: 1, critical: 2 }
  const overall: GuardrailLevel = order[daily] >= order[monthly] ? daily : monthly

  let banner: string | undefined
  if (overall === 'critical') {
    banner = daily === 'critical'
      ? `今日成本 $${todayUsd.toFixed(2)} 已超过预算 $${thresholds.daily_warning_usd}`
      : `本月成本 $${monthUsd.toFixed(2)} 已超过预算 $${thresholds.monthly_warning_usd}`
  } else if (overall === 'warning') {
    banner = daily === 'warning'
      ? `今日成本接近预算上限（${Math.round(dPct * 100)}%）`
      : `本月成本接近预算上限（${Math.round(mPct * 100)}%）`
  }

  return {
    daily_level: daily,
    monthly_level: monthly,
    overall_level: overall,
    daily_pct: Math.round(dPct * 100) / 100,
    monthly_pct: Math.round(mPct * 100) / 100,
    banner_message: banner,
  }
}

// ─────────────────────────────────────────────────
// V3.2 — Hard cap decision (pure)
// Given an evaluated guardrail status, decide whether to BLOCK a new model
// call. Only blocks at 'critical' (>=100% of threshold) and only when the
// hard cap is enabled. Default-on: COST_HARD_CAP must be exactly "0" to opt out.
// ─────────────────────────────────────────────────
export interface BlockDecision {
  blocked: boolean
  reason?: string
}

export function isHardCapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.COST_HARD_CAP ?? '1') !== '0'
}

export function shouldBlockModelCall(
  status: GuardrailStatus,
  opts: { enforce?: boolean } = {},
): BlockDecision {
  const enforce = opts.enforce ?? isHardCapEnabled()
  if (!enforce) return { blocked: false }
  if (status.overall_level !== 'critical') return { blocked: false }
  const which = status.daily_level === 'critical' ? '今日' : '本月'
  return {
    blocked: true,
    reason: `成本硬上限触发：${which}预算已用尽（${which === '今日'
      ? Math.round(status.daily_pct * 100)
      : Math.round(status.monthly_pct * 100)}%）。调高 COST_${which === '今日' ? 'DAILY' : 'MONTHLY'}_WARN_USD 或设 COST_HARD_CAP=0 解除。`,
  }
}
