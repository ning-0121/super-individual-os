// ─────────────────────────────────────────────────
// V2.6 — AI Gateway cost estimator (pure)
// Given input + output tokens and the model's per-1M-token rates,
// returns the estimated USD cost rounded to 6 decimal places.
// ─────────────────────────────────────────────────

export interface CostInputs {
  input_tokens: number
  output_tokens: number
  cost_input_usd_per_1m: number
  cost_output_usd_per_1m: number
}

export function estimateCostUSD(input: CostInputs): number {
  const inToks  = Math.max(0, input.input_tokens ?? 0)
  const outToks = Math.max(0, input.output_tokens ?? 0)
  const inRate  = Math.max(0, input.cost_input_usd_per_1m ?? 0)
  const outRate = Math.max(0, input.cost_output_usd_per_1m ?? 0)
  const usd = (inToks / 1_000_000) * inRate + (outToks / 1_000_000) * outRate
  return Math.round(usd * 1_000_000) / 1_000_000
}

// Format dollars for UI: <$0.01 displays "<$0.01", otherwise 4 decimals
export function formatCostUSD(usd: number): string {
  if (!usd || usd === 0) return '$0'
  if (usd < 0.0001)      return '<$0.0001'
  if (usd < 0.01)        return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(4)}`
}
