import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProviderAdapter, ProviderInvokeInput, ProviderInvokeResult, ProviderName, StreamChunk,
} from './providers/types'
import { anthropicAdapter } from './providers/anthropic'
import { openaiAdapter } from './providers/openai'
import { mockAdapter } from './providers/mock'
import { estimateCostUSD } from './cost'
import { routeModelForTask, type TaskStage } from './model-router'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.6 — AI Gateway
// Single entry point for all LLM calls. Handles:
// - Routing (TaskStage → provider + model)
// - Adapter dispatch
// - Fallback chain on error
// - Cost estimation (from model_registry rates, with hard-coded defaults)
// - model_runs persistence
// ─────────────────────────────────────────────────

export interface GatewayInvokeArgs {
  stage: TaskStage
  prompt: string
  system?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens?: number
  temperature?: number
  // Bookkeeping
  task_run_id?: string | null
  agent_type?: string
  // Override the routing (e.g. user picked a specific model in Settings)
  force_provider?: ProviderName
  force_model?: string
  // Skip persistence — used by tests
  skip_persist?: boolean
}

export interface GatewayInvokeResult {
  text: string
  provider: ProviderName
  model: string
  input_tokens: number
  output_tokens: number
  latency_ms: number
  cost_usd_estimated: number
  reason: string
  fallback_used: boolean
  primary_provider?: ProviderName
  primary_model?: string
  metadata?: Record<string, unknown>
}

// ─────────────────────────────────────────────────
// Adapter registry. Order matters for the fallback chain when the
// primary provider is unavailable or throws mid-call.
// ─────────────────────────────────────────────────
function getAdapter(name: ProviderName): ProviderAdapter | null {
  switch (name) {
    case 'anthropic': return anthropicAdapter
    case 'openai':    return openaiAdapter
    case 'mock':      return mockAdapter
    default:          return null
  }
}

function fallbackChain(primary: ProviderName): ProviderName[] {
  // Conservative default chain: anthropic → openai → mock
  const ALL: ProviderName[] = ['anthropic', 'openai', 'mock']
  const others = ALL.filter(p => p !== primary)
  return [primary, ...others]
}

// ─────────────────────────────────────────────────
// Cost lookup — pulls per-1M-token rates from model_registry, with
// in-memory caching to avoid round-tripping on every call. Defaults
// to 0 (free) when not found.
// ─────────────────────────────────────────────────
interface RateEntry { in: number; out: number }
const RATE_CACHE = new Map<string, RateEntry>()
let RATES_LOADED_AT = 0
const RATE_TTL_MS = 5 * 60 * 1000

const FALLBACK_RATES: Record<string, RateEntry> = {
  'anthropic:claude-sonnet-4-6':       { in: 3,    out: 15  },
  'anthropic:claude-3-5-haiku-latest': { in: 0.8,  out: 4   },
  'openai:gpt-4o':                     { in: 2.5,  out: 10  },
  'openai:gpt-4o-mini':                { in: 0.15, out: 0.6 },
  'gemini:gemini-1.5-pro':             { in: 1.25, out: 5   },
  'mock:mock-echo':                    { in: 0,    out: 0   },
}

async function rateFor(supabase: SupabaseClient | null, provider: string, model: string): Promise<RateEntry> {
  const key = `${provider}:${model}`
  if (RATE_CACHE.has(key)) return RATE_CACHE.get(key)!

  // Try DB once per TTL
  if (supabase && Date.now() - RATES_LOADED_AT > RATE_TTL_MS) {
    try {
      const { data } = await supabase
        .from('model_registry')
        .select('provider, model_name, cost_input_usd_per_1m, cost_output_usd_per_1m')
        .eq('is_enabled', true)
      for (const r of data ?? []) {
        RATE_CACHE.set(`${r.provider}:${r.model_name}`, {
          in: Number(r.cost_input_usd_per_1m),
          out: Number(r.cost_output_usd_per_1m),
        })
      }
      RATES_LOADED_AT = Date.now()
    } catch { /* swallow; fall through to defaults */ }
    if (RATE_CACHE.has(key)) return RATE_CACHE.get(key)!
  }

  return FALLBACK_RATES[key] ?? { in: 0, out: 0 }
}

// ─────────────────────────────────────────────────
// Pure helper — exposed for tests. Given an adapter list and an invoke
// input, walk the chain until one succeeds. Returns the result plus a
// flag indicating whether a fallback was used.
// ─────────────────────────────────────────────────
export interface RunWithFallbackResult {
  result: ProviderInvokeResult
  fallback_used: boolean
  primary_provider: ProviderName
  primary_model: string
  errors: Array<{ provider: ProviderName; error: string }>
}

export async function runWithFallback(
  adapters: ProviderAdapter[], primary_model: string, primary_provider: ProviderName,
  input: ProviderInvokeInput,
  modelByProvider?: Partial<Record<ProviderName, string>>,
): Promise<RunWithFallbackResult> {
  const errors: Array<{ provider: ProviderName; error: string }> = []
  for (let i = 0; i < adapters.length; i++) {
    const a = adapters[i]
    if (!a.available()) {
      errors.push({ provider: a.name, error: 'unavailable' })
      continue
    }
    const modelForThis = modelByProvider?.[a.name] ?? (i === 0 ? primary_model : input.model)
    try {
      const result = await a.invoke({ ...input, model: modelForThis })
      return {
        result,
        fallback_used: a.name !== primary_provider,
        primary_provider,
        primary_model,
        errors,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push({ provider: a.name, error: msg })
    }
  }
  throw new Error(`All providers failed: ${errors.map(e => `${e.provider}:${e.error}`).join(' | ')}`)
}

// ─────────────────────────────────────────────────
// Persistence — record a model_runs row
// ─────────────────────────────────────────────────
async function persistRun(
  supabase: SupabaseClient, userId: string,
  args: {
    task_run_id?: string | null
    agent_type?: string
    stage: TaskStage
    result: ProviderInvokeResult
    cost_usd: number
    reason: string
    fallback_used: boolean
    primary_provider: ProviderName
    primary_model: string
    status: 'success' | 'error'
    error_message?: string
  },
): Promise<void> {
  try {
    await supabase.from('model_runs').insert({
      user_id: userId,
      task_run_id: args.task_run_id ?? null,
      provider: args.result.provider,
      model: args.result.model,
      agent_type: args.agent_type ?? null,
      task_kind: args.stage,
      reason: args.reason,
      input_tokens: args.result.input_tokens,
      output_tokens: args.result.output_tokens,
      duration_ms: args.result.latency_ms,
      status: args.status,
      error_message: args.error_message ?? null,
      cost_usd_estimated: args.cost_usd,
      fallback_used: args.fallback_used,
      primary_provider: args.fallback_used ? args.primary_provider : null,
      primary_model: args.fallback_used ? args.primary_model : null,
      metadata: args.result.metadata ?? {},
    })
  } catch (e) {
    logger.warn('model_runs.persist_fail', { error_message: (e as Error).message })
  }
}

// ─────────────────────────────────────────────────
// Public — non-streaming invoke
// ─────────────────────────────────────────────────
export async function invokeGateway(
  supabase: SupabaseClient | null, userId: string | null, args: GatewayInvokeArgs,
): Promise<GatewayInvokeResult> {
  const route = args.force_provider && args.force_model
    ? { provider: args.force_provider, model: args.force_model, reason: 'force_override' }
    : routeModelForTask(args.stage)

  const chain = fallbackChain(route.provider as ProviderName)
  const adapters = chain.map(getAdapter).filter((a): a is ProviderAdapter => a !== null)

  const input: ProviderInvokeInput = {
    model: route.model,
    system: args.system,
    prompt: args.prompt,
    messages: args.messages,
    max_tokens: args.max_tokens,
    temperature: args.temperature,
  }

  const { result, fallback_used, primary_provider, primary_model } = await runWithFallback(
    adapters, route.model, route.provider as ProviderName, input,
  )

  const rates = await rateFor(supabase, result.provider, result.model)
  const cost_usd = estimateCostUSD({
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_input_usd_per_1m: rates.in,
    cost_output_usd_per_1m: rates.out,
  })

  if (supabase && userId && !args.skip_persist) {
    await persistRun(supabase, userId, {
      task_run_id: args.task_run_id,
      agent_type: args.agent_type,
      stage: args.stage,
      result,
      cost_usd,
      reason: route.reason,
      fallback_used,
      primary_provider, primary_model,
      status: 'success',
    })
  }

  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    latency_ms: result.latency_ms,
    cost_usd_estimated: cost_usd,
    reason: route.reason,
    fallback_used,
    primary_provider: fallback_used ? primary_provider : undefined,
    primary_model: fallback_used ? primary_model : undefined,
    metadata: result.metadata,
  }
}

// ─────────────────────────────────────────────────
// Public — streaming invoke
// Returns a stream + a finalize() that resolves with full stats and
// also writes to model_runs.
// ─────────────────────────────────────────────────
export interface GatewayStreamResult {
  provider: ProviderName
  model: string
  reason: string
  fallback_used: boolean
  primary_provider?: ProviderName
  primary_model?: string
  stream: AsyncIterable<StreamChunk>
  // Resolves AFTER the stream is consumed. Idempotent.
  finalize: () => Promise<GatewayInvokeResult>
}

export async function streamGateway(
  supabase: SupabaseClient | null, userId: string | null, args: GatewayInvokeArgs,
): Promise<GatewayStreamResult> {
  const route = args.force_provider && args.force_model
    ? { provider: args.force_provider, model: args.force_model, reason: 'force_override' }
    : routeModelForTask(args.stage)

  const chain = fallbackChain(route.provider as ProviderName)

  // Walk chain — first adapter whose stream() succeeds wins.
  // Note: any in-flight stream error after first token is NOT auto-failed-over;
  // we only fall back on initial connection / pre-token errors.
  const errors: Array<{ provider: ProviderName; error: string }> = []
  let usedAdapter: ProviderAdapter | null = null
  let started: Awaited<ReturnType<NonNullable<ProviderAdapter['stream']>>> | null = null

  for (let i = 0; i < chain.length; i++) {
    const a = getAdapter(chain[i])
    if (!a || !a.available() || !a.stream) { errors.push({ provider: chain[i], error: 'unavailable_or_no_stream' }); continue }
    try {
      started = await a.stream({
        model: i === 0 ? route.model : route.model,  // simplest: reuse primary model name
        system: args.system,
        prompt: args.prompt,
        messages: args.messages,
        max_tokens: args.max_tokens,
        temperature: args.temperature,
      })
      usedAdapter = a
      break
    } catch (e) {
      errors.push({ provider: chain[i], error: (e as Error).message })
    }
  }

  if (!usedAdapter || !started) {
    throw new Error(`All providers failed to stream: ${errors.map(e => `${e.provider}:${e.error}`).join(' | ')}`)
  }

  const usedProvider = usedAdapter.name
  const fallback_used = usedProvider !== route.provider
  const primary_provider = route.provider as ProviderName
  const primary_model = route.model

  let cached: GatewayInvokeResult | null = null

  return {
    provider: usedProvider,
    model: route.model,
    reason: route.reason,
    fallback_used,
    primary_provider: fallback_used ? primary_provider : undefined,
    primary_model: fallback_used ? primary_model : undefined,
    stream: started.stream,
    finalize: async () => {
      if (cached) return cached
      const stats = await started.finalize()
      const rates = await rateFor(supabase, usedProvider, route.model)
      const cost_usd = estimateCostUSD({
        input_tokens: stats.input_tokens,
        output_tokens: stats.output_tokens,
        cost_input_usd_per_1m: rates.in,
        cost_output_usd_per_1m: rates.out,
      })
      const result: ProviderInvokeResult = {
        text: stats.full_text,
        input_tokens: stats.input_tokens,
        output_tokens: stats.output_tokens,
        model: route.model,
        provider: usedProvider,
        latency_ms: stats.latency_ms,
      }
      if (supabase && userId && !args.skip_persist) {
        await persistRun(supabase, userId, {
          task_run_id: args.task_run_id,
          agent_type: args.agent_type,
          stage: args.stage,
          result, cost_usd,
          reason: route.reason,
          fallback_used, primary_provider, primary_model,
          status: 'success',
        })
      }
      cached = {
        text: stats.full_text,
        provider: usedProvider,
        model: route.model,
        input_tokens: stats.input_tokens,
        output_tokens: stats.output_tokens,
        latency_ms: stats.latency_ms,
        cost_usd_estimated: cost_usd,
        reason: route.reason,
        fallback_used,
        primary_provider: fallback_used ? primary_provider : undefined,
        primary_model: fallback_used ? primary_model : undefined,
      }
      return cached
    },
  }
}
