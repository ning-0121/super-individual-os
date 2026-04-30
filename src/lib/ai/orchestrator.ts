import type { ExecutionUnit, AgentType, TaskPriority, TaskType } from '@/types'

// ── Orchestrator output types ──────────────────────
export interface PlannedTask {
  title: string
  description: string
  task_type: TaskType
  requested_agent_type: AgentType
  priority: TaskPriority
  expected_output: string
  acceptance_criteria: string
  order: number
  depends_on: number[]
  subtasks?: PlannedTask[]
}

export interface ExecutionPlan {
  plan_summary: string
  estimated_days: number
  tasks: PlannedTask[]
}

// ── Build orchestrator system prompt ──────────────
export function buildOrchestratorPrompt(agents: ExecutionUnit[]): string {
  const agentList = agents
    .filter(a => a.type !== 'human')
    .map(a => `- ${a.agent_type.toUpperCase()} (${a.name}): ${a.description}`)
    .join('\n')

  return `You are the Orchestrator for a Multi-Agent Execution OS.
Your job: receive a project goal → generate a concrete task execution plan → assign each task to the right agent.

Available Agents:
${agentList}

Agent Type Routing Rules:
- Product planning, PRD, user stories → product
- Code, development, API, database, bug → engineering
- Research, competitive analysis, market study → research
- Marketing, content, SEO, acquisition → growth
- Budget, cost, revenue, financial model → finance
- Legal, compliance, contract, risk → legal
- UI, UX, design, visual, prototype → design
- 3D, avatar, character, animation, digital human → 3d_avatar
- Testing, QA, validation, bug check → qa
- Deployment, DevOps, CI/CD, infrastructure → devops

Output ONLY valid JSON (no markdown, no code blocks):
{
  "plan_summary": "One paragraph describing the overall execution approach",
  "estimated_days": <number>,
  "tasks": [
    {
      "title": "Concrete task title",
      "description": "What needs to be done, with enough context",
      "task_type": "feature|research|design|engineering|content|review|deployment|analysis|planning|general",
      "requested_agent_type": "product|engineering|research|growth|finance|legal|design|3d_avatar|qa|devops",
      "priority": "must|important|optional",
      "expected_output": "Specific deliverable expected",
      "acceptance_criteria": "How to verify it is done correctly",
      "order": <1-based integer>,
      "depends_on": [<order numbers of prerequisite tasks>]
    }
  ]
}

Rules:
- Maximum 10 tasks per plan
- Each task must have clear acceptance_criteria
- Tasks should be ordered logically (research before build, design before engineering)
- Only include tasks that are concrete and actionable
- Do NOT include vague tasks like "think about strategy"`
}

// ── Parse Claude's JSON output ─────────────────────
export function parseOrchestratorOutput(raw: string): ExecutionPlan | null {
  try {
    // Strip potential markdown code fences
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned) as ExecutionPlan
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) return null

    // Validate and sanitize
    const VALID_AGENT_TYPES: AgentType[] = ['product','engineering','research','growth','finance','legal','design','3d_avatar','qa','devops','strategic','orchestrator','general']
    const VALID_TASK_TYPES: TaskType[]   = ['feature','research','design','engineering','content','review','deployment','analysis','planning','general']
    const VALID_PRIORITIES: TaskPriority[] = ['must','important','optional']

    parsed.tasks = parsed.tasks.map((t, i) => ({
      ...t,
      order: t.order ?? i + 1,
      depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
      requested_agent_type: VALID_AGENT_TYPES.includes(t.requested_agent_type) ? t.requested_agent_type : 'general',
      task_type: VALID_TASK_TYPES.includes(t.task_type) ? t.task_type : 'general',
      priority: VALID_PRIORITIES.includes(t.priority) ? t.priority : 'important',
    }))

    return parsed
  } catch {
    return null
  }
}
