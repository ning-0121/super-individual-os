import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import {
  summarize, breakdownByModel, breakdownByStage, mostExpensiveModel,
  inWindow, startOfToday, startOfThisWeekISO, startOfThisMonth,
  type ModelRunRow,
} from '@/lib/cost/aggregate'
import { evaluateGuardrails, DEFAULT_GUARDRAILS } from '@/lib/cost/guardrails'

// GET /api/cost
// Returns the full Cost Dashboard payload:
//   - summary windows: today / week / month / all
//   - by_model + by_stage breakdowns (over all)
//   - guardrails status (computed against today + month)
//   - thresholds (so UI can display "$5 / $100")
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const sinceMonth = startOfThisMonth()
  // Pull only this-month rows; older runs are irrelevant for daily/weekly views.
  // For "all-time" totals on the dashboard, we add a small total below.
  const { data, error } = await supabase.from('model_runs')
    .select('provider, model, agent_type, task_kind, input_tokens, output_tokens, duration_ms, status, cost_usd_estimated, fallback_used, created_at')
    .eq('user_id', user.id)
    .gte('created_at', sinceMonth)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return apiError(error.message, { status: 400 })

  const rows = (data ?? []) as unknown as ModelRunRow[]

  const tStart = startOfToday()
  const wStart = startOfThisWeekISO()

  const today = inWindow(rows, tStart)
  const week  = inWindow(rows, wStart)
  const month = rows

  const summary = {
    today: summarize(today),
    week:  summarize(week),
    month: summarize(month),
  }

  const by_model = breakdownByModel(month)
  const by_stage = breakdownByStage(month)
  const top_model = mostExpensiveModel(month)

  // All-time grand totals (cheap aggregate without rows)
  const { count: lifetimeCalls } = await supabase.from('model_runs')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id)

  const guardrails = evaluateGuardrails(
    summary.today.cost_usd, summary.month.cost_usd, DEFAULT_GUARDRAILS,
  )

  return Response.json({
    summary,
    lifetime: { calls: lifetimeCalls ?? 0 },
    by_model,
    by_stage,
    top_model,
    guardrails,
    thresholds: DEFAULT_GUARDRAILS,
    generated_at: new Date().toISOString(),
  })
}
