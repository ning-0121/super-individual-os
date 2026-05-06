import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { callClaude } from '@/lib/ai/model-router'

// ─────────────────────────────────────────────────
// V2.3 — New Venture: AI-drafted proposal
// User describes their venture in plain Chinese/English. Claude returns a
// structured JSON plan (System + Project + Tasks + Budget + Workflow).
// User reviews/edits, then materializes via POST /api/new-venture.
// ─────────────────────────────────────────────────

export interface DraftedVenture {
  system: {
    name: string
    type: 'startup' | 'product' | 'consulting' | 'research' | 'other'
    business_goal: string
    owner_manager: 'ceo' | 'engineering_manager' | 'design_manager' | 'growth_manager'
  }
  project: {
    name: string
    description: string
    north_star_metric: string
    north_star_target: string
    monthly_focus: string
  }
  tasks: Array<{ title: string; description: string; assigned_role: string; priority: 'high' | 'medium' | 'low' }>
  budget: { total_usd: number; breakdown: Array<{ item: string; usd: number; rationale: string }> }
  workflow: {
    weekly_cadence: string
    escalation_to_ceo: string[]
    autonomous_actions: string[]
  }
  growth_experiments: Array<{ name: string; channel: string; hypothesis: string; target_metric: string }>
  reasoning: string
}

const SYSTEM_PROMPT = `You are the AI Co-founder of Super Individual OS.
The user has just described a new venture in natural language.
Produce a STRUCTURED, ACTIONABLE bootstrap plan that the OS will materialize.

Return ONLY valid JSON matching this TypeScript interface, with no markdown fences, no commentary:

{
  "system": {
    "name": string,                                    // <= 30 chars, the business-line name
    "type": "startup" | "product" | "consulting" | "research" | "other",
    "business_goal": string,                           // 1 sentence, includes a measurable target + 3-month horizon
    "owner_manager": "ceo" | "engineering_manager" | "design_manager" | "growth_manager"
  },
  "project": {
    "name": string,                                    // first concrete project (smallest viable slice)
    "description": string,                             // 1-2 sentences
    "north_star_metric": string,                       // e.g. 'paid subscribers'
    "north_star_target": string,                       // numeric target as string, e.g. '1000'
    "monthly_focus": string                            // the ONE thing to ship this month
  },
  "tasks": [
    { "title": string, "description": string, "assigned_role": "ceo"|"engineering_manager"|"design_manager"|"qa_manager"|"growth_manager"|"finance_manager", "priority": "high"|"medium"|"low" }
  ],                                                    // 5-8 concrete starter tasks
  "budget": {
    "total_usd": number,                                // realistic monthly budget for the FIRST month
    "breakdown": [ { "item": string, "usd": number, "rationale": string } ]
  },
  "workflow": {
    "weekly_cadence": string,                           // 1-2 sentences on the rhythm
    "escalation_to_ceo": [string],                      // bullets of what gets escalated
    "autonomous_actions": [string]                      // bullets of what AI managers handle without asking
  },
  "growth_experiments": [
    { "name": string, "channel": string, "hypothesis": string, "target_metric": string }
  ],                                                    // 3-5 experiments tailored to the venture
  "reasoning": string                                   // 1-2 sentences on why this plan
}

Rules:
- Be opinionated. Default to action. Pick numbers — never say "TBD".
- Tasks must be SPECIFIC (not "do research" — instead "interview 5 prospective subscribers about hook concepts").
- Budget should reflect a lean solo-founder monthly spend (typically $50-$500 for a content/SaaS venture in month 1).
- Match the user's language: if they wrote in Chinese, return Chinese strings.`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { description } = await req.json().catch(() => ({})) as { description?: string }
  if (!description?.trim()) return apiError('description required', { status: 400 })
  if (description.length > 4000) return apiError('description too long (max 4000 chars)', { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return apiError('AI 服务未配置（ANTHROPIC_API_KEY 缺失）', { status: 503 })
  }

  try {
    const out = await callClaude({
      system: SYSTEM_PROMPT,
      prompt: `用户的项目描述：\n\n${description}\n\n请输出结构化 JSON。`,
      max_tokens: 3000,
      temperature: 0.4,
    })

    // Extract JSON (Claude sometimes wraps even when asked not to)
    let jsonText = out.text.trim()
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonText = fenceMatch[1].trim()

    let parsed: DraftedVenture
    try {
      parsed = JSON.parse(jsonText) as DraftedVenture
    } catch {
      return apiError('AI 返回内容不是有效 JSON，请重试或换种描述方式', { status: 502 })
    }

    // Best-effort log to model_runs (table is V2.2)
    await supabase.from('model_runs').insert({
      user_id: user.id,
      provider: 'anthropic',
      model: out.model,
      agent_type: 'ai_cofounder',
      task_kind: 'venture_bootstrap',
      reason: 'new_venture.draft',
      input_tokens: out.input_tokens,
      output_tokens: out.output_tokens,
      duration_ms: out.duration_ms,
      status: 'success',
    }).then(() => undefined, () => undefined)

    return Response.json({ ok: true, draft: parsed,
      meta: { model: out.model, input_tokens: out.input_tokens, output_tokens: out.output_tokens } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return apiError(`AI 起草失败：${msg}`, { status: 502 })
  }
}
