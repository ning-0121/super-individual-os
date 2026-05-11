import type {
  ProviderAdapter, ProviderInvokeInput, ProviderInvokeResult, ProviderStreamResult, StreamChunk,
} from './types'

// ─────────────────────────────────────────────────
// V2.6 — OpenAI provider adapter (fetch-based, no SDK)
// Supports both non-streaming and SSE streaming via OpenAI chat completions.
// ─────────────────────────────────────────────────

const HAS_KEY = !!process.env.OPENAI_API_KEY

function buildMessages(input: ProviderInvokeInput) {
  const m: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (input.system) m.push({ role: 'system', content: input.system })
  for (const x of input.messages ?? []) m.push({ role: x.role, content: x.content })
  m.push({ role: 'user', content: input.prompt })
  return m
}

export const openaiAdapter: ProviderAdapter = {
  name: 'openai',

  available() { return HAS_KEY },

  async invoke(input: ProviderInvokeInput): Promise<ProviderInvokeResult> {
    if (!HAS_KEY) throw new Error('OPENAI_API_KEY not configured')
    const start = Date.now()
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.max_tokens ?? 4096,
        temperature: input.temperature ?? 0.4,
        messages: buildMessages(input),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = await res.json() as {
      choices: Array<{ message: { content: string }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    return {
      text: data.choices[0]?.message?.content ?? '',
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model: input.model,
      provider: 'openai',
      latency_ms: Date.now() - start,
      metadata: { finish_reason: data.choices[0]?.finish_reason },
    }
  },

  async stream(input: ProviderInvokeInput): Promise<ProviderStreamResult> {
    if (!HAS_KEY) throw new Error('OPENAI_API_KEY not configured')
    const start = Date.now()
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.max_tokens ?? 4096,
        temperature: input.temperature ?? 0.4,
        stream: true,
        messages: buildMessages(input),
      }),
    })
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI stream ${res.status}: ${body.slice(0, 300)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full_text = ''
    let buffer = ''

    async function* iter(): AsyncIterable<StreamChunk> {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') return
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              full_text += delta
              yield { type: 'text_delta', text: delta }
            }
          } catch { /* skip non-JSON keep-alives */ }
        }
      }
    }

    return {
      stream: iter(),
      finalize: async () => ({
        full_text,
        // OpenAI streaming doesn't return token counts in the stream itself
        // unless stream_options.include_usage is set. We approximate.
        input_tokens: 0,
        output_tokens: Math.ceil(full_text.length / 4),  // rough English approximation
        latency_ms: Date.now() - start,
      }),
    }
  },
}
