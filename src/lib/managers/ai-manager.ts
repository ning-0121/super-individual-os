import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Manager, ManagerRole, RiskLevel } from '@/types'
import { findManagerByRole, createManagerDecision } from '@/services/managers'
import { logger } from '@/lib/observability'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────
// V2.1 — AI Manager auto-decisions
// Each manager role has a system_prompt (from DB) + a strict-JSON
// decision envelope appended at decision time.
// ─────────────────────────────────────────────────

export interface DecisionContext {
  action_type: string
  risk_level: RiskLevel
  classification_reason: string
  agent_type?: string
  agent_name?: string
  tools_allowed?: string[]
  task_title?: string
  task_description?: string
  task_acceptance_criteria?: string
  project_name?: string
  project_goal?: string
  current_stage?: number
  current_stage_name?: string
  policy_name?: string
}

export interface DecisionOutput {
  decision: 'approve' | 'reject'
  reasoning: string
  confidence: number
  manager_id: string
  role: ManagerRole
}

const DECISION_ENVELOPE = `

---
## 你现在的任务：审批决策

请根据上方的系统提示和下方的请求详情，给出严格 JSON 决策（不要 markdown 代码块）：

{
  "decision": "approve" | "reject",
  "reasoning": "决策理由（不超过 100 字，引用具体 risk / 情境）",
  "confidence": 0.0 到 1.0
}

判断准则：
- 默认偏保守：信息不足时倾向 reject
- approve 必须能说出"为什么这次安全"
- reject 必须给出可改进的方向
- 只输出 JSON，前后无任何额外文字`

function buildContextPrompt(ctx: DecisionContext): string {
  const lines: string[] = []
  lines.push(`# 待审批请求`)
  lines.push(`- 动作类型: ${ctx.action_type}`)
  lines.push(`- 风险等级: L${ctx.risk_level}`)
  lines.push(`- 分类理由: ${ctx.classification_reason}`)
  if (ctx.agent_name)             lines.push(`- 执行 Agent: ${ctx.agent_name} (${ctx.agent_type ?? 'unknown'})`)
  if (ctx.tools_allowed?.length)   lines.push(`- Agent 可用工具: ${ctx.tools_allowed.join(', ')}`)
  if (ctx.policy_name)             lines.push(`- 触发的策略: ${ctx.policy_name}`)
  if (ctx.task_title)              lines.push(`\n## 任务\n${ctx.task_title}`)
  if (ctx.task_description)        lines.push(`### 描述\n${ctx.task_description}`)
  if (ctx.task_acceptance_criteria) lines.push(`### 验收标准\n${ctx.task_acceptance_criteria}`)
  if (ctx.project_name) {
    lines.push(`\n## 项目背景`)
    lines.push(`- 项目: ${ctx.project_name}`)
    if (ctx.project_goal)   lines.push(`- 项目目标: ${ctx.project_goal}`)
    if (ctx.current_stage)  lines.push(`- 当前阶段: ${ctx.current_stage} ${ctx.current_stage_name ?? ''}`)
  }
  return lines.join('\n')
}

// ─────────────────────────────────────────────────
// Core function — call Claude with manager system prompt
// ─────────────────────────────────────────────────
export async function aiManagerDecision(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  role: ManagerRole,
  ctx: DecisionContext,
): Promise<DecisionOutput | null> {
  const manager = await findManagerByRole(supabase, userId, projectId, role)
  if (!manager) {
    logger.warn('ai_manager.missing', { user_id: userId, project_id: projectId, role })
    return null
  }

  const baseSystem = manager.system_prompt && manager.system_prompt.trim().length > 0
    ? manager.system_prompt
    : `你是项目的 ${manager.name}（角色：${role}）。`

  const userMessage = buildContextPrompt(ctx)

  let rawText = ''
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: baseSystem + DECISION_ENVELOPE,
      messages: [{ role: 'user', content: userMessage }],
    })
    rawText = resp.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
  } catch (e) {
    logger.error('ai_manager.call_fail', {
      role, error_message: e instanceof Error ? e.message : String(e),
    })
    return null
  }

  // Robust JSON parse
  let cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1)

  type Parsed = { decision?: string; reasoning?: string; confidence?: number }
  let parsed: Parsed = {}
  try { parsed = JSON.parse(cleaned) as Parsed } catch { /* malformed */ }

  const decision: 'approve' | 'reject' =
    parsed.decision === 'approve' ? 'approve' : 'reject'   // default: reject on parse failure
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI 经理输出无法解析，默认 reject'
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5

  // Persist decision
  await createManagerDecision(supabase, {
    userId,
    projectId,
    managerId: manager.id,
    decisionType: decision === 'approve' ? 'approve' : 'reject',
    targetType: 'approval_request',
    targetId: null,
    reasoning,
    metadata: {
      action_type: ctx.action_type,
      risk_level: ctx.risk_level,
      decided_via: 'ai_auto',
      confidence,
    },
  })

  logger.info('ai_manager.decided', {
    user_id: userId, project_id: projectId, role,
    decision, confidence, action_type: ctx.action_type,
  })

  return { decision, reasoning, confidence, manager_id: manager.id, role }
}

// ─────────────────────────────────────────────────
// Spec-compliance named exports — V2.1 Part 5
// ctoDecision / cpoDecision / cooDecision / qaDecision
// ─────────────────────────────────────────────────
export const ctoDecision = (sb: SupabaseClient, u: string, p: string, c: DecisionContext) =>
  aiManagerDecision(sb, u, p, 'engineering_manager', c)

export const cpoDecision = (sb: SupabaseClient, u: string, p: string, c: DecisionContext) =>
  aiManagerDecision(sb, u, p, 'design_manager', c)

export const cooDecision = (sb: SupabaseClient, u: string, p: string, c: DecisionContext) =>
  aiManagerDecision(sb, u, p, 'growth_manager', c)

export const qaDecision = (sb: SupabaseClient, u: string, p: string, c: DecisionContext) =>
  aiManagerDecision(sb, u, p, 'qa_manager', c)

// Convenience: run through all required managers; ALL must approve.
export async function aiManagersUnanimous(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  roles: ManagerRole[],
  ctx: DecisionContext,
): Promise<{ all_approved: boolean; decisions: DecisionOutput[] }> {
  const decisions: DecisionOutput[] = []
  for (const role of roles) {
    const d = await aiManagerDecision(supabase, userId, projectId, role, ctx)
    if (!d) {
      // Missing manager or call failure → conservative reject
      decisions.push({
        decision: 'reject', reasoning: `Manager ${role} unavailable`,
        confidence: 0, manager_id: '', role,
      })
      continue
    }
    decisions.push(d)
    if (d.decision === 'reject') break   // short-circuit on first reject
  }
  const all_approved = decisions.length > 0 && decisions.every(d => d.decision === 'approve')
  return { all_approved, decisions }
}
