import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateGuardrails, shouldBlockModelCall, DEFAULT_GUARDRAILS,
  type GuardrailStatus, type BlockDecision,
} from '@/lib/cost/guardrails'
import { startOfToday, startOfThisMonth } from '@/lib/cost/aggregate'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V3.2 — Budget guard (DB orchestration)
// Reads this user's month-to-date model spend and evaluates guardrails.
// `assertBudgetAllowed` is the pre-flight a model-calling code path runs:
// it returns { allowed:false, reason } when the hard cap is tripped.
//
// Fail-OPEN on query error: a transient DB hiccup must not block real work.
// The hard cap is a runaway-spend backstop, not a correctness gate.
// ─────────────────────────────────────────────────

export interface BudgetStatus {
  today_usd: number
  month_usd: number
  guardrails: GuardrailStatus
}

export async function getBudgetStatus(
  supabase: SupabaseClient, userId: string, now: Date = new Date(),
): Promise<BudgetStatus> {
  const monthStart = startOfThisMonth(now)
  const todayStart = startOfToday(now)

  const { data, error } = await supabase.from('model_runs')
    .select('cost_usd_estimated, created_at')
    .eq('user_id', userId)
    .gte('created_at', monthStart)
    .limit(10000)

  if (error) {
    logger.warn('budget.query_fail', { user_id: userId, error_message: error.message })
    // Fail open — report zero spend so we don't block.
    return {
      today_usd: 0, month_usd: 0,
      guardrails: evaluateGuardrails(0, 0, DEFAULT_GUARDRAILS),
    }
  }

  let monthUsd = 0
  let todayUsd = 0
  for (const r of data ?? []) {
    const cost = Number((r as { cost_usd_estimated?: number }).cost_usd_estimated ?? 0)
    monthUsd += cost
    if ((r as { created_at: string }).created_at >= todayStart) todayUsd += cost
  }

  return {
    today_usd: round6(monthUsd === 0 ? 0 : todayUsd),
    month_usd: round6(monthUsd),
    guardrails: evaluateGuardrails(todayUsd, monthUsd, DEFAULT_GUARDRAILS),
  }
}

export interface BudgetVerdict extends BlockDecision {
  status: BudgetStatus
}

// Pre-flight gate for any code path about to spend model tokens.
export async function assertBudgetAllowed(
  supabase: SupabaseClient, userId: string, now: Date = new Date(),
): Promise<BudgetVerdict> {
  const status = await getBudgetStatus(supabase, userId, now)
  const decision = shouldBlockModelCall(status.guardrails)
  if (decision.blocked) {
    logger.warn('budget.blocked', {
      user_id: userId,
      month_usd: status.month_usd,
      today_usd: status.today_usd,
      reason: decision.reason,
    })
  }
  return { ...decision, status }
}

// Thrown by callers that prefer exceptions over branching.
export class BudgetExceededError extends Error {
  status: BudgetStatus
  constructor(reason: string, status: BudgetStatus) {
    super(reason)
    this.name = 'BudgetExceededError'
    this.status = status
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
