// ─────────────────────────────────────────────────
// V2.1 Part 6 — Model Router
// Picks the best model for a given agent role / task kind.
// V2.1 ships with Claude as the default executor for everything.
// OpenAI / Gemini paths are stubs — flip when you add OPENAI_API_KEY etc.
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
