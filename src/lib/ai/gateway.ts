import Anthropic from '@anthropic-ai/sdk'
import type { ExecutionUnit, Task } from '@/types'

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
  raw_text: string
}

export interface ProjectContext {
  name: string
  goal: string
  description: string
}

// ─────────────────────────────────────────────────
// Output envelope appended to every agent prompt
// ─────────────────────────────────────────────────
const OUTPUT_ENVELOPE = `

---

## 重要：最终输出格式

完成任务后，你必须输出一个 JSON 对象（不要用 \`\`\`json 代码块包裹），格式严格如下：

{
  "summary": "一句话总结你完成了什么（不超过 50 字）",
  "output": "你的完整交付物（使用 markdown 格式，可以包含表格、列表、代码块等）",
  "reasoning_summary": "你的解决思路（不超过 100 字）",
  "risks": ["注意事项 1", "注意事项 2"],
  "next_steps": ["建议后续动作 1", "建议后续动作 2"]
}

只输出这个 JSON，前后不要任何其他文字、解释或 markdown。`

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
  lines.push(`\n请开始执行任务，按上述 JSON 格式输出最终结果。`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────
// Strip markdown fences and parse JSON
// ─────────────────────────────────────────────────
function parseAgentOutput(rawText: string): Omit<AgentRunResult, 'raw_text'> {
  // Try multiple cleaning passes
  let cleaned = rawText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  // Try to extract first JSON object if there's surrounding text
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd   = cleaned.lastIndexOf('}')
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }

  try {
    const parsed = JSON.parse(cleaned) as Partial<AgentRunResult>
    return {
      summary:           typeof parsed.summary === 'string' ? parsed.summary : '任务已执行',
      output:            typeof parsed.output === 'string' ? parsed.output : rawText,
      reasoning_summary: typeof parsed.reasoning_summary === 'string' ? parsed.reasoning_summary : '',
      risks:             Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
      next_steps:        Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String) : [],
    }
  } catch {
    // Fallback: treat entire raw output as the deliverable
    return {
      summary: '任务已执行（输出未结构化）',
      output: rawText,
      reasoning_summary: '',
      risks: [],
      next_steps: [],
    }
  }
}

// ─────────────────────────────────────────────────
// Main entry: run an agent on a task
// ─────────────────────────────────────────────────
export async function runAgentTask(params: {
  agent: ExecutionUnit
  task: Task
  projectContext?: ProjectContext | null
}): Promise<AgentRunResult> {
  const { agent, task, projectContext = null } = params

  // Compose system prompt: agent's persona + output envelope
  const baseSystem = agent.system_prompt && agent.system_prompt.trim().length > 0
    ? agent.system_prompt
    : `你是一名 ${agent.name}，专精领域：${agent.description || '通用执行'}。${agent.style_prompt || ''}`

  const fullSystem = baseSystem + OUTPUT_ENVELOPE
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
  return { ...parsed, raw_text: rawText }
}
