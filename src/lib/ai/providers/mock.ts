import type {
  ProviderAdapter, ProviderInvokeInput, ProviderInvokeResult, ProviderStreamResult, StreamChunk,
} from './types'

// ─────────────────────────────────────────────────
// V2.6 — Mock provider adapter (test + local fallback only)
// Echoes a canned response. Configurable failure mode via env or option:
//   process.env.MOCK_PROVIDER_FAIL=true  → invoke() / stream() throws
// Useful for unit-testing the gateway fallback chain.
// ─────────────────────────────────────────────────

export interface MockAdapterOptions {
  /** When true, all invocations throw — useful for fallback tests */
  forceFail?: boolean
  /** Reply prefix prepended to the prompt echo */
  prefix?: string
}

export function makeMockAdapter(opts: MockAdapterOptions = {}): ProviderAdapter {
  const forceFail = opts.forceFail ?? (process.env.MOCK_PROVIDER_FAIL === 'true')
  const prefix = opts.prefix ?? '[mock]'

  return {
    name: 'mock',

    available() { return true },

    async invoke(input: ProviderInvokeInput): Promise<ProviderInvokeResult> {
      if (forceFail) throw new Error('Mock provider forced failure')
      const start = Date.now()
      const text = `${prefix} ${input.prompt}`
      return {
        text,
        input_tokens: Math.ceil(input.prompt.length / 4),
        output_tokens: Math.ceil(text.length / 4),
        model: input.model,
        provider: 'mock',
        latency_ms: Date.now() - start,
        metadata: { mock: true },
      }
    },

    async stream(input: ProviderInvokeInput): Promise<ProviderStreamResult> {
      if (forceFail) throw new Error('Mock provider forced failure')
      const start = Date.now()
      const text = `${prefix} ${input.prompt}`
      let full = ''
      async function* iter(): AsyncIterable<StreamChunk> {
        // Stream in 10-char chunks
        for (let i = 0; i < text.length; i += 10) {
          const piece = text.slice(i, i + 10)
          full += piece
          yield { type: 'text_delta', text: piece }
        }
      }
      return {
        stream: iter(),
        finalize: async () => ({
          full_text: full || text,
          input_tokens: Math.ceil(input.prompt.length / 4),
          output_tokens: Math.ceil(text.length / 4),
          latency_ms: Date.now() - start,
        }),
      }
    },
  }
}

// Default export for routing-registry use
export const mockAdapter = makeMockAdapter()
