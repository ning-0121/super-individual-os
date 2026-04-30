import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionUnit, Task } from '@/types'
import type { ToolCall, ToolResult } from '@/lib/tools/types'
import { MAX_TOOL_CALLS_PER_RUN } from '@/lib/tools/types'
import { describeTool, executeToolCall } from '@/lib/tools/router'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────
// Result schema
// ─────────────────────────────────────────────────
export interface AgentRunResult {
  summary: string
  output: string
  reasoning_summary: string
  risks: string[]
  next_steps: string[]
  tool_calls: ToolResult[]
  raw_text: string
}

export interface ProjectContext {
  name: string
  goal: string
  description: string
}

// ─────────────────────────────────────────────────
// Build tools block (only injected when agent has connected tools)
// ─────────────────────────────────────────────────
function buildToolsBlock(toolNames: string[]): string {
  if (toolNames.length === 0) return ''

  const lines: string[] = ['', '## 可用工具', '', '你可以在执行任务时调用以下真实工具。调用后系统会执行并把结果附在最终响应中。', '']

  for (const name of toolNames) {
    const desc = describeTool(name)
    if (!desc) continue
    lines.push(`### \`${name}\``)
    for (const a of desc.actions) {
      lines.push(`- **${a.name}** — ${a.description}`)
      lines.push(`  参数: ${a.params.join(' | ')}`)
      if (a.example) {
        lines.push(`  示例参数: \`${JSON.stringify(a.example)}\``)
      }
    }
    lines.push('')
  }

  lines.push('### 调用方式')
  lines.push('在最终 JSON 输出中加入 `tool_calls` 数组：')
  lines.push('```json')
  lines.push(JSON.stringify({
    tool_calls: [
      {
        tool: 'github',
        action: 'createPullRequest',
        params: {
          repo: 'user/repo',
          branch: 'agent/feature-x',
          title: 'feat: implement X',
          body: '## What\nDetails…',
          files: [{ path: 'docs/agent-output.md', content: '...' }],
        },
      },
    ],
  }, null, 2))
  lines.push('```')
  lines.push(`- 一次最多 ${MAX_TOOL_CALLS_PER_RUN} 个工具调用`)
  lines.push('- 不需要调用工具时，`"tool_calls": []`')
  lines.push('- 如果任务需要写代码、改代码、提 PR 等真实动作，**必须调用工具**而不是只输出代码')
  return lines.join('\n')
}

// ─────────────────────────────────────────────────
// Output envelope
// ─────────────────────────────────────────────────
function buildOutputEnvelope(hasTools: boolean): string {
  const toolsField = hasTools
    ? `,\n  "tool_calls": [ /* 见上方工具说明，如不需要则为 [] */ ]`
    : `,\n  "tool_calls": []`

  return `

---

## 重要：最终输出格式

完成任务后，你必须输出一个 JSON 对象（不要用 \`\`\`json 代码块包裹），格式严格如下：

{
  "summary": "一句话总结你完成了什么（不超过 50 字）",
  "output": "你的完整交付物（使用 markdown 格式）",
  "reasoning_summary": "你的解决思路（不超过 100 字）",
  "risks": ["注意事项 1", "注意事项 2"],
  "next_steps": ["建议后续动作 1", "建议后续动作 2"]${toolsField}
}

只输出这个 JSON，前后不要任何其他文字、解释或 markdown 代码块包装。`
}

// ─────────────────────────────────────────────────
// Build user message from task
// ─────────────────────────────────────────────────
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
  lines.push(`\n请开始执行任务，按上方 JSON 格式输出最终结果。`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────
// JSON parsing with multi-pass cleanup
// ─────────────────────────────────────────────────
interface ParsedAgentOutput {
  summary: string
  output: string
  reasoning_summary: string
  risks: string[]
  next_steps: string[]
  tool_calls: ToolCall[]
}

function parseAgentOutput(rawText: string): ParsedAgentOutput {
  let cleaned = rawText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1)

  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedAgentOutput>
    return {
      summary:           typeof parsed.summary === 'string' ? parsed.summary : '任务已执行',
      output:            typeof parsed.output === 'string' ? parsed.output : rawText,
      reasoning_summary: typeof parsed.reasoning_summary === 'string' ? parsed.reasoning_summary : '',
      risks:             Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
      next_steps:        Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String) : [],
      tool_calls:        Array.isArray(parsed.tool_calls) ? (parsed.tool_calls as ToolCall[]) : [],
    }
  } catch {
    return {
      summary: '任务已执行（输出未结构化）',
      output: rawText,
      reasoning_summary: '',
      risks: [],
      next_steps: [],
      tool_calls: [],
    }
  }
}

// ─────────────────────────────────────────────────
// Main: run agent on a task
// ─────────────────────────────────────────────────
export async function runAgentTask(params: {
  agent: ExecutionUnit
  task: Task
  projectContext?: ProjectContext | null
  userId: string
  supabase: SupabaseClient
  availableTools?: string[]
}): Promise<AgentRunResult> {
  const { agent, task, projectContext = null, userId, supabase, availableTools = [] } = params

  const baseSystem = agent.system_prompt && agent.system_prompt.trim().length > 0
    ? agent.system_prompt
    : `你是一名 ${agent.name}。专精：${agent.description || '通用执行'}。${agent.style_prompt || ''}`

  const fullSystem = baseSystem + buildToolsBlock(availableTools) + buildOutputEnvelope(availableTools.length > 0)
  const userMessage = buildTaskPrompt(task, projectContext)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: fullSystem,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('\n')
    .trim()

  const parsed = parseAgentOutput(rawText)

  // ── Execute declared tool calls ────────────────
  const toolResults: ToolResult[] = []
  const declaredCalls = parsed.tool_calls.slice(0, MAX_TOOL_CALLS_PER_RUN)

  for (const call of declaredCalls) {
    // Sanity: agent must be allowed to use this tool
    const allowed = (agent.tools_allowed ?? []) as string[]
    if (!allowed.includes(call.tool)) {
      toolResults.push({
        tool: call.tool, action: call.action, params: call.params,
        status: 'error',
        error: `Agent ${agent.name} 未被授权使用工具 ${call.tool}`,
        duration_ms: 0,
        executed_at: new Date().toISOString(),
      })
      continue
    }

    if (!availableTools.includes(call.tool)) {
      toolResults.push({
        tool: call.tool, action: call.action, params: call.params,
        status: 'error',
        error: `工具 ${call.tool} 未连接（请到 /tools 配置）`,
        duration_ms: 0,
        executed_at: new Date().toISOString(),
      })
      continue
    }

    const r = await executeToolCall(call, userId, supabase)
    toolResults.push(r)
  }

  return {
    summary: parsed.summary,
    output: parsed.output,
    reasoning_summary: parsed.reasoning_summary,
    risks: parsed.risks,
    next_steps: parsed.next_steps,
    tool_calls: toolResults,
    raw_text: rawText,
  }
}
