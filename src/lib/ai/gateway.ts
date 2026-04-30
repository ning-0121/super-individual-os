import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionUnit, Task } from '@/types'
import type { ToolCall, ToolResult } from '@/lib/tools/types'
import { MAX_TOOL_CALLS_PER_RUN } from '@/lib/tools/types'
import { describeTool, executeToolCall } from '@/lib/tools/router'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const DEFAULT_MAX_STEPS = 5

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────
export interface IntermediateStep {
  step: number
  thinking: string
  tool_calls: ToolResult[]
  output_preview: string
  is_final: boolean
  duration_ms: number
}

export interface AgentLoopResult {
  final_output: string
  summary: string
  reasoning_summary: string
  risks: string[]
  next_steps: string[]
  tool_calls: ToolResult[]              // flattened from all steps
  intermediate_steps: IntermediateStep[]
  total_steps: number
}

export interface AgentEvaluation {
  verdict: 'approved' | 'revision_required' | 'rejected'
  score: number
  strengths: string[]
  issues: string[]
  suggestions: string[]
  evaluator_unit_id: string
  evaluator_name: string
}

export interface ProjectContext {
  name: string
  goal: string
  description: string
}

// Backward-compat shape kept by /api/chat etc.
export interface AgentRunResult {
  summary: string
  output: string
  reasoning_summary: string
  risks: string[]
  next_steps: string[]
  tool_calls: ToolResult[]
  intermediate_steps: IntermediateStep[]
  total_steps: number
  raw_text: string
}

// ─────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────
function buildToolsBlock(toolNames: string[]): string {
  if (toolNames.length === 0) return ''
  const lines: string[] = ['', '## 可用工具', '']
  for (const name of toolNames) {
    const desc = describeTool(name)
    if (!desc) continue
    lines.push(`### \`${name}\``)
    for (const a of desc.actions) {
      lines.push(`- **${a.name}** — ${a.description}`)
      lines.push(`  参数: ${a.params.join(' | ')}`)
      if (a.example) lines.push(`  示例: \`${JSON.stringify(a.example)}\``)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function buildMultiStepEnvelope(maxSteps: number): string {
  return `

---

## 输出格式（每一步严格按此 JSON）

{
  "reasoning_summary": "本步在做什么、思考是什么（≤100字）",
  "tool_calls": [
    { "tool": "github", "action": "createPullRequest", "params": { ... } }
  ],
  "summary": "",
  "output": "",
  "risks": [],
  "next_steps": []
}

## 多步执行规则

- 你最多有 **${maxSteps}** 步
- **中间步骤**（需要继续调工具）：仅填 \`reasoning_summary\` 和 \`tool_calls\`，其他字段留空
- **最终步骤**（不再调工具）：填 \`reasoning_summary\`、\`summary\`、\`output\`、\`risks\`、\`next_steps\`，且 \`tool_calls: []\`
- 每步最多 ${MAX_TOOL_CALLS_PER_RUN} 个工具调用
- 工具执行结果会作为下一轮的输入返回给你
- 没有可用工具或不需要工具时直接进入最终步骤

只输出 JSON，前后不要任何解释或代码块包装。`
}

function buildTaskPrompt(task: Task, projectContext: ProjectContext | null): string {
  const lines: string[] = []
  lines.push(`# 任务：${task.title}`)
  if (task.description) lines.push(`\n## 任务描述\n${task.description}`)
  if (task.expected_output) lines.push(`\n## 预期输出\n${task.expected_output}`)
  if (task.acceptance_criteria) lines.push(`\n## 验收标准\n${task.acceptance_criteria}`)
  if (task.task_type && task.task_type !== 'general') lines.push(`\n## 任务类型\n${task.task_type}`)
  if (projectContext) {
    lines.push(`\n## 项目背景`)
    lines.push(`- 项目名：${projectContext.name}`)
    if (projectContext.goal) lines.push(`- 项目目标：${projectContext.goal}`)
    if (projectContext.description) lines.push(`- 项目描述：${projectContext.description}`)
  }
  lines.push(`\n请开始执行任务（多步执行：先思考 → 必要时调用工具 → 最后输出最终交付物）。`)
  return lines.join('\n')
}

function buildToolResultsMessage(results: ToolResult[]): string {
  const lines = ['## 上一步工具执行结果\n']
  for (const r of results) {
    if (r.status === 'success') {
      const summary = JSON.stringify(r.result ?? {}).slice(0, 600)
      lines.push(`✓ \`${r.tool}.${r.action}\` 成功（${r.duration_ms}ms）`)
      lines.push(`  返回：${summary}`)
    } else {
      lines.push(`✗ \`${r.tool}.${r.action}\` 失败：${r.error}`)
    }
  }
  lines.push('\n请基于以上结果决定下一步：继续调工具，或进入最终步骤输出完整交付物。')
  return lines.join('\n')
}

// ─────────────────────────────────────────────────
// Output parsing
// ─────────────────────────────────────────────────
interface ParsedOutput {
  summary: string
  output: string
  reasoning_summary: string
  risks: string[]
  next_steps: string[]
  tool_calls: ToolCall[]
}

function parseAgentOutput(rawText: string): ParsedOutput {
  let cleaned = rawText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1)

  try {
    const p = JSON.parse(cleaned) as Partial<ParsedOutput>
    return {
      summary:           typeof p.summary === 'string' ? p.summary : '',
      output:            typeof p.output === 'string' ? p.output : '',
      reasoning_summary: typeof p.reasoning_summary === 'string' ? p.reasoning_summary : '',
      risks:             Array.isArray(p.risks) ? p.risks.map(String) : [],
      next_steps:        Array.isArray(p.next_steps) ? p.next_steps.map(String) : [],
      tool_calls:        Array.isArray(p.tool_calls) ? (p.tool_calls as ToolCall[]) : [],
    }
  } catch {
    return {
      summary: '任务已执行（输出未结构化）',
      output: rawText,
      reasoning_summary: '',
      risks: [], next_steps: [], tool_calls: [],
    }
  }
}

// ─────────────────────────────────────────────────
// Main: multi-step agent loop
// ─────────────────────────────────────────────────
export async function runAgentLoop(params: {
  agent: ExecutionUnit
  task: Task
  projectContext?: ProjectContext | null
  userId: string
  supabase: SupabaseClient
  availableTools?: string[]
  maxSteps?: number
}): Promise<AgentLoopResult> {
  const {
    agent, task, projectContext = null, userId, supabase,
    availableTools = [], maxSteps = DEFAULT_MAX_STEPS,
  } = params

  const baseSystem = agent.system_prompt && agent.system_prompt.trim().length > 0
    ? agent.system_prompt
    : `你是一名 ${agent.name}。专精：${agent.description || '通用执行'}。${agent.style_prompt || ''}`

  const fullSystem = baseSystem + buildToolsBlock(availableTools) + buildMultiStepEnvelope(maxSteps)

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildTaskPrompt(task, projectContext) },
  ]

  const steps: IntermediateStep[] = []
  const allToolCalls: ToolResult[] = []
  let finalParsed: ParsedOutput | null = null

  for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
    const stepStart = Date.now()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: fullSystem,
      messages,
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('\n')
      .trim()

    const parsed = parseAgentOutput(rawText)

    // Execute declared tool calls
    const toolResults: ToolResult[] = []
    const declared = parsed.tool_calls.slice(0, MAX_TOOL_CALLS_PER_RUN)
    const allowed = (agent.tools_allowed ?? []) as string[]

    for (const call of declared) {
      if (!allowed.includes(call.tool)) {
        toolResults.push({
          tool: call.tool, action: call.action, params: call.params,
          status: 'error',
          error: `Agent ${agent.name} 未被授权使用工具 ${call.tool}`,
          duration_ms: 0, executed_at: new Date().toISOString(),
        })
        continue
      }
      if (!availableTools.includes(call.tool)) {
        toolResults.push({
          tool: call.tool, action: call.action, params: call.params,
          status: 'error',
          error: `工具 ${call.tool} 未连接（请到 /tools 配置）`,
          duration_ms: 0, executed_at: new Date().toISOString(),
        })
        continue
      }
      toolResults.push(await executeToolCall(call, userId, supabase))
    }
    allToolCalls.push(...toolResults)

    // Decide if this is the final step:
    // - No tool calls were declared (and execution had nothing to run), or
    // - Reached MAX_STEPS
    const declaredAny = declared.length > 0
    const isFinalStep = !declaredAny || stepNum === maxSteps

    steps.push({
      step: stepNum,
      thinking: parsed.reasoning_summary || '(无说明)',
      tool_calls: toolResults,
      output_preview: parsed.output ? parsed.output.slice(0, 300) : (parsed.summary || ''),
      is_final: isFinalStep,
      duration_ms: Date.now() - stepStart,
    })

    if (isFinalStep) {
      finalParsed = parsed
      break
    }

    // Keep history for next iteration
    messages.push({ role: 'assistant', content: rawText })
    messages.push({ role: 'user', content: buildToolResultsMessage(toolResults) })
  }

  // If we hit MAX_STEPS without a "final" step, the last parsed output IS the final
  if (!finalParsed && steps.length > 0) {
    // Reparse from last raw — but we didn't keep raw. The last step's output_preview is fine.
    finalParsed = {
      summary: '达到最大步数',
      output: steps[steps.length - 1].output_preview,
      reasoning_summary: steps[steps.length - 1].thinking,
      risks: ['Agent 在最大步数内未完成最终输出'],
      next_steps: ['考虑增加 max_steps 或拆解任务'],
      tool_calls: [],
    }
  }

  return {
    final_output:      finalParsed?.output ?? '',
    summary:           finalParsed?.summary || '任务已执行',
    reasoning_summary: steps[steps.length - 1]?.thinking ?? '',
    risks:             finalParsed?.risks ?? [],
    next_steps:        finalParsed?.next_steps ?? [],
    tool_calls:        allToolCalls,
    intermediate_steps: steps,
    total_steps:       steps.length,
  }
}

// ─────────────────────────────────────────────────
// QA Agent: review another agent's output
// ─────────────────────────────────────────────────
function buildQAReviewPrompt(params: {
  task: Task
  primaryAgent: ExecutionUnit
  primaryResult: AgentLoopResult
  projectContext: ProjectContext | null
}): string {
  const { task, primaryAgent, primaryResult, projectContext } = params
  const lines: string[] = []
  lines.push(`# 待审核任务：${task.title}`)
  if (task.description) lines.push(`\n## 任务描述\n${task.description}`)
  if (task.expected_output) lines.push(`\n## 预期输出\n${task.expected_output}`)
  if (task.acceptance_criteria) lines.push(`\n## 验收标准（核心）\n${task.acceptance_criteria}`)
  if (projectContext) lines.push(`\n## 项目背景\n${projectContext.name}: ${projectContext.goal}`)

  lines.push(`\n---\n## ${primaryAgent.name} 的交付`)
  if (primaryResult.summary) lines.push(`\n### 摘要\n${primaryResult.summary}`)
  if (primaryResult.reasoning_summary) lines.push(`\n### 解决思路\n${primaryResult.reasoning_summary}`)
  lines.push(`\n### 完整交付物\n${primaryResult.final_output || '(空)'}`)

  if (primaryResult.tool_calls.length > 0) {
    lines.push(`\n### 实际执行的工具调用 (${primaryResult.tool_calls.length} 次)`)
    for (const tc of primaryResult.tool_calls) {
      if (tc.status === 'success') {
        const r = JSON.stringify(tc.result ?? {}).slice(0, 400)
        lines.push(`- ✓ \`${tc.tool}.${tc.action}\` → ${r}`)
      } else {
        lines.push(`- ✗ \`${tc.tool}.${tc.action}\` → 失败：${tc.error}`)
      }
    }
  }

  if (primaryResult.intermediate_steps.length > 1) {
    lines.push(`\n### 执行过程（${primaryResult.total_steps} 步）`)
    for (const s of primaryResult.intermediate_steps) {
      lines.push(`- 第 ${s.step} 步：${s.thinking}`)
    }
  }

  lines.push(`\n---\n请按规定 JSON 格式严格输出评估结果。`)
  return lines.join('\n')
}

export async function runQAEvaluation(params: {
  qaAgent: ExecutionUnit
  primaryAgent: ExecutionUnit
  task: Task
  primaryResult: AgentLoopResult
  projectContext?: ProjectContext | null
}): Promise<AgentEvaluation> {
  const { qaAgent, primaryAgent, task, primaryResult, projectContext = null } = params

  const baseSystem = qaAgent.system_prompt || `你是 QA Agent，专注质量验收。`
  const evalEnvelope = `

---

## 重要：你正在审核另一个 Agent 的输出

任务：基于「验收标准」严格评估 ${primaryAgent.name} 的交付。

输出严格 JSON（无 markdown 代码块、无任何前后文字）：

{
  "verdict": "approved" | "revision_required" | "rejected",
  "score": <0-10 整数>,
  "strengths": ["优点 1", "优点 2"],
  "issues": ["问题 1", "问题 2"],
  "suggestions": ["改进建议 1", "改进建议 2"]
}

判定标准：
- **approved**: 完全满足验收标准，可以交付
- **revision_required**: 主体方向正确，但有具体可改之处
- **rejected**: 严重偏离验收标准或包含致命错误，需要重做

如果交付包含 PR / Issue 等真实工具产出，请确认其内容是否符合任务要求。
注意：你不要自己写一份新的交付物，只评估现有的。`

  const userMessage = buildQAReviewPrompt({ task, primaryAgent, primaryResult, projectContext })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: baseSystem + evalEnvelope,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('\n')
    .trim()

  let cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1)

  try {
    const p = JSON.parse(cleaned) as Partial<AgentEvaluation>
    const v = p.verdict
    const verdict: AgentEvaluation['verdict'] =
      (v === 'approved' || v === 'revision_required' || v === 'rejected') ? v : 'revision_required'

    return {
      verdict,
      score: typeof p.score === 'number' ? Math.max(0, Math.min(10, Math.round(p.score))) : 5,
      strengths:   Array.isArray(p.strengths)   ? p.strengths.map(String)   : [],
      issues:      Array.isArray(p.issues)      ? p.issues.map(String)      : [],
      suggestions: Array.isArray(p.suggestions) ? p.suggestions.map(String) : [],
      evaluator_unit_id: qaAgent.id,
      evaluator_name: qaAgent.name,
    }
  } catch {
    return {
      verdict: 'revision_required',
      score: 0,
      strengths: [],
      issues: ['QA Agent 输出无法解析 JSON'],
      suggestions: [`原始输出片段：${rawText.slice(0, 200)}`],
      evaluator_unit_id: qaAgent.id,
      evaluator_name: qaAgent.name,
    }
  }
}

// ─────────────────────────────────────────────────
// Backward-compat wrapper
// ─────────────────────────────────────────────────
export async function runAgentTask(params: {
  agent: ExecutionUnit
  task: Task
  projectContext?: ProjectContext | null
  userId: string
  supabase: SupabaseClient
  availableTools?: string[]
}): Promise<AgentRunResult> {
  const r = await runAgentLoop({ ...params, maxSteps: DEFAULT_MAX_STEPS })
  return {
    summary: r.summary,
    output: r.final_output,
    reasoning_summary: r.reasoning_summary,
    risks: r.risks,
    next_steps: r.next_steps,
    tool_calls: r.tool_calls,
    intermediate_steps: r.intermediate_steps,
    total_steps: r.total_steps,
    raw_text: '',
  }
}
