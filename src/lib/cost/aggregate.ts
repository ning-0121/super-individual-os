// ─────────────────────────────────────────────────
// V3.0 — Cost Dashboard pure aggregators
// All functions deterministic — no DB, no time-now, takes rows + "now".
// ─────────────────────────────────────────────────

export interface ModelRunRow {
  provider: string
  model: string
  agent_type: string | null
  task_kind: string | null
  input_tokens: number
  output_tokens: number
  duration_ms: number
  status: 'success' | 'error' | 'blocked'
  cost_usd_estimated: number
  fallback_used: boolean
  created_at: string                   // ISO
}

export interface WindowSummary {
  calls: number
  cost_usd: number
  avg_latency_ms: number
  fallback_count: number
  failure_count: number
  prompt_tokens: number
  completion_tokens: number
}

export interface ModelBreakdownRow {
  provider: string
  model: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost: number
  avg_latency: number
  fallback_count: number
  failure_count: number
}

export interface StageBreakdownRow {
  stage: string                        // task_kind (preferred) or agent_type
  calls: number
  cost_usd: number
  avg_latency_ms: number
  failure_count: number
  failure_rate: number                 // 0..1
}

// ─────────────────────────────────────────────────
// Sum a slice into a WindowSummary
// ─────────────────────────────────────────────────
export function summarize(rows: ModelRunRow[]): WindowSummary {
  if (rows.length === 0) {
    return { calls: 0, cost_usd: 0, avg_latency_ms: 0,
      fallback_count: 0, failure_count: 0,
      prompt_tokens: 0, completion_tokens: 0 }
  }
  let cost = 0, latencySum = 0, fb = 0, fail = 0
  let pTok = 0, cTok = 0
  for (const r of rows) {
    cost += Number(r.cost_usd_estimated ?? 0)
    latencySum += r.duration_ms ?? 0
    if (r.fallback_used) fb++
    if (r.status === 'error') fail++
    pTok += r.input_tokens ?? 0
    cTok += r.output_tokens ?? 0
  }
  return {
    calls: rows.length,
    cost_usd: round6(cost),
    avg_latency_ms: Math.round(latencySum / rows.length),
    fallback_count: fb,
    failure_count: fail,
    prompt_tokens: pTok,
    completion_tokens: cTok,
  }
}

// ─────────────────────────────────────────────────
// Filter by ISO-time window [start, now]
// ─────────────────────────────────────────────────
export function inWindow(rows: ModelRunRow[], startIso: string): ModelRunRow[] {
  return rows.filter(r => r.created_at >= startIso)
}

// ─────────────────────────────────────────────────
// Convenience windows relative to a reference "now"
// ─────────────────────────────────────────────────
export function startOfToday(now: Date = new Date()): string {
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
export function startOfThisWeekISO(now: Date = new Date()): string {
  // ISO-style: Monday-anchored. (Sun=0 → 6 days back; Mon=1 → 0)
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - dow)
  return d.toISOString()
}
export function startOfThisMonth(now: Date = new Date()): string {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(1)
  return d.toISOString()
}

// ─────────────────────────────────────────────────
// Per-model breakdown
// ─────────────────────────────────────────────────
export function breakdownByModel(rows: ModelRunRow[]): ModelBreakdownRow[] {
  const map = new Map<string, ModelBreakdownRow>()
  for (const r of rows) {
    const key = `${r.provider}::${r.model}`
    const cur = map.get(key) ?? {
      provider: r.provider, model: r.model,
      calls: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      estimated_cost: 0, avg_latency: 0,
      fallback_count: 0, failure_count: 0,
    }
    cur.calls++
    cur.prompt_tokens     += r.input_tokens ?? 0
    cur.completion_tokens += r.output_tokens ?? 0
    cur.total_tokens      += (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
    cur.estimated_cost    += Number(r.cost_usd_estimated ?? 0)
    cur.avg_latency       += r.duration_ms ?? 0               // running sum; divided below
    if (r.fallback_used) cur.fallback_count++
    if (r.status === 'error') cur.failure_count++
    map.set(key, cur)
  }
  // Finalize: average latency, round costs, sort by cost desc
  return Array.from(map.values())
    .map(b => ({
      ...b,
      estimated_cost: round6(b.estimated_cost),
      avg_latency: b.calls > 0 ? Math.round(b.avg_latency / b.calls) : 0,
    }))
    .sort((a, b) => b.estimated_cost - a.estimated_cost)
}

// ─────────────────────────────────────────────────
// Per-stage breakdown (task_kind primary, agent_type fallback)
// ─────────────────────────────────────────────────
export function breakdownByStage(rows: ModelRunRow[]): StageBreakdownRow[] {
  const map = new Map<string, { calls: number; cost: number; lat: number; fail: number }>()
  for (const r of rows) {
    const stage = (r.task_kind || r.agent_type || 'uncategorized').toLowerCase()
    const cur = map.get(stage) ?? { calls: 0, cost: 0, lat: 0, fail: 0 }
    cur.calls++
    cur.cost += Number(r.cost_usd_estimated ?? 0)
    cur.lat  += r.duration_ms ?? 0
    if (r.status === 'error') cur.fail++
    map.set(stage, cur)
  }
  return Array.from(map.entries())
    .map(([stage, v]) => ({
      stage,
      calls: v.calls,
      cost_usd: round6(v.cost),
      avg_latency_ms: v.calls > 0 ? Math.round(v.lat / v.calls) : 0,
      failure_count: v.fail,
      failure_rate: v.calls > 0 ? round6(v.fail / v.calls) : 0,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
}

// ─────────────────────────────────────────────────
// "Most expensive model in a window" helper
// ─────────────────────────────────────────────────
export function mostExpensiveModel(rows: ModelRunRow[]): ModelBreakdownRow | null {
  const top = breakdownByModel(rows)[0]
  return top && top.estimated_cost > 0 ? top : null
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
