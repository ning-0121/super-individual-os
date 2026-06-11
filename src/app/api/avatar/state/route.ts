import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk } from '@/lib/observability'
import { reportError } from '@/lib/error-reporter'
import { buildAvatarSystemPrompt, parseLLMAvatarOutput, suggestFromText } from '@/lib/avatar/llm-driver'
import { assertBudgetAllowed } from '@/services/cost-budget'
import type { AvatarState } from '@/lib/avatar/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/avatar/state
 * Body: { text: string, current?: AvatarState }
 *
 * Calls Claude to map free-text → AvatarLLMOutput.
 * Falls back to local keyword heuristic if Claude is unavailable.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const { text, current } = await req.json() as { text: string; current?: AvatarState }
    if (!text || typeof text !== 'string') return apiError('text required', { status: 400, code: 'missing_field' })

    // P1-1 — cost hard cap before spending tokens.
    const budget = await assertBudgetAllowed(supabase, user.id)
    if (budget.blocked) {
      return apiError(budget.reason ?? '成本已触顶', { status: 402, code: 'budget_exceeded' })
    }

    const userMessage = current
      ? `当前状态：mood=${current.mood}, expression=${current.expression}, action=${current.action}\n\n用户输入：${text}\n\n请输出新状态 JSON。`
      : `用户输入：${text}\n\n请输出玩偶应该的状态 JSON。`

    let parsed = null
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: buildAvatarSystemPrompt(),
        messages: [{ role: 'user', content: userMessage }],
      })

      const raw = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { text: string }).text)
        .join('').trim()

      let cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1)

      try {
        parsed = parseLLMAvatarOutput(JSON.parse(cleaned))
      } catch {
        parsed = null
      }
    } catch (e) {
      reportError(e, { user_id: user.id, endpoint: '/api/avatar/state' })
    }

    // Fallback to local heuristic if LLM unavailable / parsing failed
    if (!parsed) {
      const local = suggestFromText(text)
      if (Object.keys(local).length > 0) {
        return apiOk({ output: local, source: 'local_heuristic' })
      }
      return apiError('No avatar reaction inferred', { status: 422, code: 'no_inference' })
    }

    return apiOk({ output: parsed, source: 'llm' })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/avatar/state' })
    return apiError('Avatar state inference failed', { status: 500 })
  }
}
