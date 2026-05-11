import type {
  ProviderAdapter, ProviderInvokeInput, ProviderInvokeResult, ProviderStreamResult, StreamChunk,
} from './types'

// ─────────────────────────────────────────────────
// V2.6 — Anthropic provider adapter
// Wraps @anthropic-ai/sdk; loads lazily to avoid bundling SDK in environments
// that don't have ANTHROPIC_API_KEY.
// ─────────────────────────────────────────────────

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY

export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',

  available() { return HAS_KEY },

  async invoke(input: ProviderInvokeInput): Promise<ProviderInvokeResult> {
    const start = Date.now()
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const messages = (input.messages ?? []).map(m => ({
      role: m.role as 'user' | 'assistant', content: m.content,
    }))
    messages.push({ role: 'user', content: input.prompt })

    const res = await client.messages.create({
      model: input.model,
      max_tokens: input.max_tokens ?? 4096,
      temperature: input.temperature ?? 0.4,
      system: input.system,
      messages,
    })
    const text = res.content.map(b => b.type === 'text' ? b.text : '').join('')

    return {
      text,
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      model: input.model,
      provider: 'anthropic',
      latency_ms: Date.now() - start,
      metadata: { stop_reason: res.stop_reason },
    }
  },

  async stream(input: ProviderInvokeInput): Promise<ProviderStreamResult> {
    const start = Date.now()
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const messages = (input.messages ?? []).map(m => ({
      role: m.role as 'user' | 'assistant', content: m.content,
    }))
    messages.push({ role: 'user', content: input.prompt })

    const upstream = await client.messages.stream({
      model: input.model,
      max_tokens: input.max_tokens ?? 4096,
      temperature: input.temperature ?? 0.4,
      system: input.system,
      messages,
    })

    let full_text = ''
    let input_tokens = 0
    let output_tokens = 0
    let finalized = false

    async function* iter(): AsyncIterable<StreamChunk> {
      for await (const chunk of upstream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          full_text += chunk.delta.text
          yield { type: 'text_delta', text: chunk.delta.text }
        }
        if (chunk.type === 'message_start') {
          input_tokens = chunk.message.usage?.input_tokens ?? 0
        }
        if (chunk.type === 'message_delta') {
          output_tokens = (chunk as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? output_tokens
        }
      }
      finalized = true
    }

    return {
      stream: iter(),
      finalize: async () => {
        // If consumer never iterated, drain
        if (!finalized) {
          for await (const _ of iter()) { /* drain */ void _ }
        }
        return { full_text, input_tokens, output_tokens, latency_ms: Date.now() - start }
      },
    }
  },
}
