// ─────────────────────────────────────────────────
// V2.6 — Provider adapter interface for AI Gateway
// Each provider implements: available(), invoke(), and optionally stream().
// Adapter results are uniform regardless of provider.
// ─────────────────────────────────────────────────

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'local' | 'mock'

export interface ProviderInvokeInput {
  model: string
  system?: string
  prompt: string
  // Optional prior conversation (assistant/user pairs)
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens?: number
  temperature?: number
}

export interface ProviderInvokeResult {
  text: string
  input_tokens: number
  output_tokens: number
  model: string
  provider: ProviderName
  latency_ms: number
  // Adapter-specific extras (model version, response id, etc.)
  metadata?: Record<string, unknown>
}

export interface StreamChunk {
  type: 'text_delta'
  text: string
}

export interface ProviderStreamResult {
  stream: AsyncIterable<StreamChunk>
  // Resolves when streaming finishes; returns final stats
  finalize: () => Promise<{
    full_text: string
    input_tokens: number
    output_tokens: number
    latency_ms: number
  }>
}

export interface ProviderAdapter {
  readonly name: ProviderName
  available(): boolean
  invoke(input: ProviderInvokeInput): Promise<ProviderInvokeResult>
  stream?(input: ProviderInvokeInput): Promise<ProviderStreamResult>
}
