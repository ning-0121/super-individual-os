import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { routeModelForTask } from '@/lib/ai/model-router'

// GET /api/cost-pulse — today's AI Gateway usage + cost
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [
    { data: today },
    { data: week },
  ] = await Promise.all([
    supabase.from('model_runs')
      .select('provider, model, cost_usd_estimated, fallback_used, status')
      .eq('user_id', user.id).gte('created_at', todayIso),
    supabase.from('model_runs')
      .select('cost_usd_estimated')
      .eq('user_id', user.id).gte('created_at', since7d),
  ])

  const todayCalls = (today ?? []).length
  const todayCostUsd = (today ?? []).reduce((sum, r) => sum + Number(r.cost_usd_estimated ?? 0), 0)
  const todayFallbacks = (today ?? []).filter(r => r.fallback_used === true).length
  const todayErrors = (today ?? []).filter(r => r.status === 'error').length
  const week7dCostUsd = (week ?? []).reduce((sum, r) => sum + Number(r.cost_usd_estimated ?? 0), 0)

  const byProvider = new Map<string, { calls: number; cost: number }>()
  for (const r of (today ?? [])) {
    const p = String(r.provider)
    const cur = byProvider.get(p) ?? { calls: 0, cost: 0 }
    cur.calls++
    cur.cost += Number(r.cost_usd_estimated ?? 0)
    byProvider.set(p, cur)
  }

  // Default model = what `routeModelForTask('engineering')` resolves to
  const defaultEng = routeModelForTask('engineering')

  return Response.json({
    today_calls: todayCalls,
    today_cost_usd: Math.round(todayCostUsd * 10000) / 10000,
    today_fallbacks: todayFallbacks,
    today_errors: todayErrors,
    week_cost_usd: Math.round(week7dCostUsd * 10000) / 10000,
    by_provider: Array.from(byProvider.entries()).map(([provider, v]) => ({
      provider, calls: v.calls, cost_usd: Math.round(v.cost * 10000) / 10000,
    })),
    default_model: { provider: defaultEng.provider, model: defaultEng.model, reason: defaultEng.reason },
    generated_at: new Date().toISOString(),
  })
}
