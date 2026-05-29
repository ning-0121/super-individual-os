// ─────────────────────────────────────────────────
// V2.1 Part 6 — Model Router
// Picks the best model for a given agent role / task kind.
// V2.1 ships with Claude as the default executor for everything.
// OpenAI is fully wired (set OPENAI_API_KEY). Gemini is NOT implemented in
// callModel yet — if a route selects it, ensureCallableChoice() degrades the
// call to Claude instead of throwing. See callModel below.
// ─────────────────────────────────────────────────

export type ModelProvider = 'anthropic' | 'openai' | 'gemini'

export interface ModelChoice {
  provider: ModelProvider
  model: string
  reason: string
}

export interface RouteInput {
  agent_type?: string                  // e.g. 'engineering' | 'research' | 'growth'
  task_kind?: 'code' | 'text' | 'research' | 'planning' | 'review'
  needs_long_context?: boolean
  needs_multimodal?: boolean
}

const HAS_OPENAI = !!process.env.OPENAI_API_KEY
const HAS_GEMINI = !!process.env.GEMINI_API_KEY

// Default model per provider (override in env if needed)
const ANTHROPIC_DEFAULT = process.env.MODEL_ANTHROPIC ?? 'claude-sonnet-4-6'
const OPENAI_DEFAULT     = process.env.MODEL_OPENAI    ?? 'gpt-4o'
const GEMINI_DEFAULT     = process.env.MODEL_GEMINI    ?? 'gemini-1.5-pro'

// ─────────────────────────────────────────────────
// Routing rules — first match wins
// ─────────────────────────────────────────────────
export function routeModel(input: RouteInput): ModelChoice {
  const t = input.agent_type
  const k = input.task_kind

  // Engineering / DevOps / QA — Claude (best for code reasoning)
  if (t === 'engineering' || t === 'devops' || t === 'qa' || k === 'code' || k === 'review') {
    return {
      provider: 'anthropic', model: ANTHROPIC_DEFAULT,
      reason: `${t ?? k} → Claude (code/review reasoning)`,
    }
  }

  // Research / Strategy / Product — long-context Claude or OpenAI
  if (t === 'research' || k === 'research' || t === 'strategic' || t === 'product') {
    if (HAS_OPENAI) {
      return {
        provider: 'openai', model: OPENAI_DEFAULT,
        reason: `${t ?? k} → GPT (web-aware research)`,
      }
    }
    return {
      provider: 'anthropic', model: ANTHROPIC_DEFAULT,
      reason: `${t ?? k} → Claude (default; no OPENAI_API_KEY set)`,
    }
  }

  // Growth — content + framing; benefits from GPT + Claude blend
  if (t === 'growth' || k === 'text') {
    if (HAS_OPENAI) {
      return {
        provider: 'openai', model: OPENAI_DEFAULT,
        reason: 'growth/copy → GPT primary',
      }
    }
    return {
      provider: 'anthropic', model: ANTHROPIC_DEFAULT,
      reason: 'growth/copy → Claude (no OPENAI_API_KEY)',
    }
  }

  // Multimodal → Gemini if available
  if (input.needs_multimodal && HAS_GEMINI) {
    return { provider: 'gemini', model: GEMINI_DEFAULT, reason: 'multimodal → Gemini' }
  }

  // Default
  return {
    provider: 'anthropic', model: ANTHROPIC_DEFAULT,
    reason: 'default route',
  }
}

export function listAvailableProviders(): ModelProvider[] {
  const providers: ModelProvider[] = ['anthropic']
  if (HAS_OPENAI) providers.push('openai')
  if (HAS_GEMINI) providers.push('gemini')
  return providers
}

// ─────────────────────────────────────────────────
// V2.2 — Routing for tool-using tasks
// Maps high-level workflow stages → provider preference.
// ─────────────────────────────────────────────────
export type TaskStage =
  | 'engineering' | 'architecture' | 'debug'
  | 'qa' | 'review' | 'risk'
  | 'research' | 'growth' | 'content'
  | 'migration_draft' | 'migration_qa'

export function routeModelForTask(stage: TaskStage): ModelChoice {
  switch (stage) {
    case 'engineering':
    case 'architecture':
    case 'debug':
    case 'migration_draft':
      return { provider: 'anthropic', model: ANTHROPIC_DEFAULT,
        reason: `${stage} → Claude (deep code reasoning)` }
    case 'qa':
    case 'review':
    case 'risk':
    case 'migration_qa':
      return HAS_OPENAI
        ? { provider: 'openai', model: OPENAI_DEFAULT, reason: `${stage} → GPT (independent reviewer)` }
        : { provider: 'anthropic', model: ANTHROPIC_DEFAULT, reason: `${stage} → Claude (no OPENAI_API_KEY)` }
    case 'research':
    case 'growth':
    case 'content':
      return HAS_OPENAI
        ? { provider: 'openai', model: OPENAI_DEFAULT, reason: `${stage} → GPT (broader knowledge)` }
        : { provider: 'anthropic', model: ANTHROPIC_DEFAULT, reason: `${stage} → Claude (no OPENAI_API_KEY)` }
  }
}

// ─────────────────────────────────────────────────
// V2.2 — Provider call shims (lazy import for size)
// ─────────────────────────────────────────────────
export interface ModelCallInput {
  system?: string
  prompt: string
  max_tokens?: number
  temperature?: number
}

export interface ModelCallOutput {
  text: string
  input_tokens: number
  output_tokens: number
  model: string
  provider: ModelProvider
  duration_ms: number
}

export async function callClaude(input: ModelCallInput, modelOverride?: string): Promise<ModelCallOutput> {
  const start = Date.now()
  // Lazy import to avoid bundling SDK when not used
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = modelOverride ?? ANTHROPIC_DEFAULT
  const res = await client.messages.create({
    model,
    max_tokens: input.max_tokens ?? 4096,
    temperature: input.temperature ?? 0.4,
    system: input.system,
    messages: [{ role: 'user', content: input.prompt }],
  })
  const text = res.content.map(b => b.type === 'text' ? b.text : '').join('')
  return {
    text,
    input_tokens: res.usage?.input_tokens ?? 0,
    output_tokens: res.usage?.output_tokens ?? 0,
    model,
    provider: 'anthropic',
    duration_ms: Date.now() - start,
  }
}

export async function callOpenAI(input: ModelCallInput, modelOverride?: string): Promise<ModelCallOutput> {
  if (!HAS_OPENAI) throw new Error('OPENAI_API_KEY not configured')
  const start = Date.now()
  const model = modelOverride ?? OPENAI_DEFAULT
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.max_tokens ?? 4096,
      temperature: input.temperature ?? 0.4,
      messages: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        { role: 'user', content: input.prompt },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: data.choices[0]?.message?.content ?? '',
    input_tokens: data.usage?.prompt_tokens ?? 0,
    output_tokens: data.usage?.completion_tokens ?? 0,
    model,
    provider: 'openai',
    duration_ms: Date.now() - start,
  }
}

// Providers with a real implementation in callModel. Keep in sync with the
// branches below — selectImplementedProvider() reads this to avoid routing to
// a provider that would throw at call time.
const IMPLEMENTED_PROVIDERS: ReadonlySet<ModelProvider> = new Set(['anthropic', 'openai'])

export function isProviderImplemented(p: ModelProvider): boolean {
  return IMPLEMENTED_PROVIDERS.has(p)
}

// Given a routing decision, return a choice that is guaranteed callable.
// Gemini (and any future unimplemented provider) degrades to Anthropic rather
// than crashing the request. The fallback is annotated in `reason` so the
// model_runs audit trail shows what actually happened.
export function ensureCallableChoice(choice: ModelChoice): ModelChoice {
  if (isProviderImplemented(choice.provider)) return choice
  return {
    provider: 'anthropic',
    model: ANTHROPIC_DEFAULT,
    reason: `${choice.provider} not implemented → fell back to Claude (${choice.reason})`,
  }
}

export async function callModel(input: ModelCallInput, choice: ModelChoice): Promise<ModelCallOutput> {
  const callable = ensureCallableChoice(choice)
  if (callable.provider === 'anthropic') return callClaude(input, callable.model)
  if (callable.provider === 'openai')    return callOpenAI(input, callable.model)
  // Unreachable: ensureCallableChoice guarantees an implemented provider.
  return callClaude(input, ANTHROPIC_DEFAULT)
}

// ─────────────────────────────────────────────────
// V2.2 — Persist a model run for audit + cost
// ─────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'

export async function recordModelRun(
  supabase: SupabaseClient, userId: string,
  args: {
    task_run_id?: string | null
    choice: ModelChoice
    agent_type?: string
    task_kind?: string
    output: ModelCallOutput
    status: 'success' | 'error'
    error_message?: string
  },
): Promise<void> {
  await supabase.from('model_runs').insert({
    user_id: userId,
    task_run_id: args.task_run_id ?? null,
    provider: args.choice.provider,
    model: args.choice.model,
    agent_type: args.agent_type ?? null,
    task_kind: args.task_kind ?? null,
    reason: args.choice.reason,
    input_tokens: args.output.input_tokens,
    output_tokens: args.output.output_tokens,
    duration_ms: args.output.duration_ms,
    status: args.status,
    error_message: args.error_message ?? null,
  })
}
