import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────
// V3.7 — Ensure executor agents exist (server, idempotent)
// executeTaskRun requires a task to be assigned to an active, non-human
// execution_unit. Imported projects only seed MANAGERS (decision layer), not
// EXECUTORS (the agents that actually run tasks + call tools). This provisions
// a focused executor workforce so "提需求 → 跑任务 → 调 GitHub → 开 PR" can
// actually dispatch. Idempotent: if the user already has an active executor,
// it returns the existing set and inserts nothing.
// ─────────────────────────────────────────────────

interface ExecutorSeed {
  type: 'agent'
  agent_type: string
  role: string
  name: string
  avatar: string
  description: string
  capabilities: string[]
  style_prompt: string
  system_prompt: string
  tools_allowed: string[]
  is_active: boolean
}

// GitHub-first: the Engineering Agent carries github/vercel/supabase so it can
// open PRs, trigger deploys, and run controlled SQL. The others give the task
// recommender variety without tool write-access.
const EXECUTOR_AGENTS: ExecutorSeed[] = [
  {
    type: 'agent', agent_type: 'engineering', role: 'executor',
    name: 'Engineering Agent', avatar: '💻',
    description: '软件开发执行体。代码实现、Bug 修复、PR、部署、受控数据库操作。',
    capabilities: ['coding', 'analysis'],
    style_prompt: '你是一位全栈工程师，代码整洁、注重可维护性，善于解释技术决策。',
    system_prompt: `你是 Engineering Agent，专注软件开发与技术实现。
任务输入时：1）分析技术需求 2）给出实现方案 3）必要时通过 github 工具改代码/开 PR 4）指出潜在问题 5）建议测试。
原则：每次只做被要求的最小改动；高危动作（部署、迁移、push）必须走审批。`,
    tools_allowed: ['github', 'vercel', 'supabase'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'product', role: 'executor',
    name: 'Product Agent', avatar: '📋',
    description: '产品执行体。PRD、用户流程、功能优先级、验收标准。',
    capabilities: ['strategy', 'writing', 'research'],
    style_prompt: '你是一位资深产品经理，擅长把用户需求转化为清晰的产品规格。',
    system_prompt: `你是 Product Agent，专注产品规划。输出：## 需求背景 ## 用户故事 ## 功能规格 ## 验收标准 ## 风险提示`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'growth', role: 'executor',
    name: 'Growth Agent', avatar: '📈',
    description: '增长执行体。获客策略、内容、SEO、转化漏斗。',
    capabilities: ['outreach', 'writing', 'analysis'],
    style_prompt: '你是一位数据驱动的增长黑客，善于找到低成本高效率的获客路径。',
    system_prompt: `你是 Growth Agent，专注增长。输出：## 增长诊断 ## 优先动作 ## 执行计划 ## 测量指标 ## 不该做的事`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'research', role: 'executor',
    name: 'Research Agent', avatar: '🔍',
    description: '调研执行体。竞品分析、用户研究、行业数据。',
    capabilities: ['research', 'analysis', 'writing'],
    style_prompt: '你是一位严谨的市场研究员，善于从海量信息中提炼关键洞察。',
    system_prompt: `你是 Research Agent，专注调研。输出：## 研究背景 ## 关键发现 ## 数据支撑 ## 结论与建议`,
    tools_allowed: [],
    is_active: true,
  },
]

export interface EnsureAgentsResult {
  created: number
  existing: number
  agents: Array<{ id: string; name: string; agent_type: string; tools_allowed: string[] }>
}

export async function listExecutorAgents(
  supabase: SupabaseClient, userId: string,
): Promise<EnsureAgentsResult['agents']> {
  const { data } = await supabase.from('execution_units')
    .select('id, name, agent_type, tools_allowed, type, is_active')
    .eq('user_id', userId).eq('type', 'agent').eq('is_active', true)
  return (data ?? []).map(a => ({
    id: a.id as string, name: a.name as string,
    agent_type: a.agent_type as string,
    tools_allowed: (a.tools_allowed as string[]) ?? [],
  }))
}

export async function ensureExecutorAgents(
  supabase: SupabaseClient, userId: string,
): Promise<EnsureAgentsResult> {
  const existing = await listExecutorAgents(supabase, userId)
  if (existing.length > 0) {
    return { created: 0, existing: existing.length, agents: existing }
  }

  const { data, error } = await supabase.from('execution_units')
    .insert(EXECUTOR_AGENTS.map(a => ({ ...a, user_id: userId })))
    .select('id, name, agent_type, tools_allowed')
  if (error) {
    // Surface to caller; best-effort sites swallow it.
    throw new Error(`ensureExecutorAgents insert failed: ${error.message}`)
  }
  const agents = (data ?? []).map(a => ({
    id: a.id as string, name: a.name as string,
    agent_type: a.agent_type as string,
    tools_allowed: (a.tools_allowed as string[]) ?? [],
  }))
  return { created: agents.length, existing: 0, agents }
}
