import { createClient } from '@/lib/supabase/client'
import type { ExecutionUnit, AgentType } from '@/types'

const db = () => createClient()

export async function getAgents(): Promise<ExecutionUnit[]> {
  const { data, error } = await db()
    .from('execution_units')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ExecutionUnit[]
}

export async function createAgent(input: Partial<ExecutionUnit>): Promise<ExecutionUnit> {
  const { data, error } = await db()
    .from('execution_units')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as ExecutionUnit
}

export async function updateAgent(id: string, input: Partial<ExecutionUnit>): Promise<void> {
  const { error } = await db()
    .from('execution_units')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function toggleAgent(id: string, is_active: boolean): Promise<void> {
  const { error } = await db()
    .from('execution_units')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getAgentTaskStats(agentId: string): Promise<{ total: number; completed: number; revised: number }> {
  const { data: runs } = await db()
    .from('task_runs')
    .select('run_status')
    .eq('assigned_unit_id', agentId)

  const total     = runs?.length ?? 0
  const completed = runs?.filter(r => r.run_status === 'completed').length ?? 0

  const { data: reviews } = await db()
    .from('task_reviews')
    .select('review_status')
    .eq('reviewer_unit_id', agentId)

  const revised = reviews?.filter(r => r.review_status === 'revision_required').length ?? 0
  return { total, completed, revised }
}

// ─────────────────────────────────────────────────
// Default agent definitions
// ─────────────────────────────────────────────────
type AgentDef = Omit<ExecutionUnit, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'execution_unit?:AgentProfile' | 'agent_profile'>

const DEFAULT_AGENTS: Omit<AgentDef, 'user_id'>[] = [
  {
    type: 'human', agent_type: 'strategic', role: 'decision_owner',
    name: '我自己', avatar: '👤',
    description: '最终决策者。负责目标定义、资源分配、方向判断和最终验收。',
    capabilities: ['strategy', 'ops'],
    style_prompt: '',
    system_prompt: '',
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'ai', agent_type: 'strategic', role: 'strategic_advisor',
    name: 'Linda 战略助理', avatar: '🧠',
    description: '首席AI战略助理。负责目标拆解、优先级判断、任务树生成和验收标准制定。',
    capabilities: ['strategy', 'research', 'analysis'],
    style_prompt: '你是Linda，一位精准、高效的AI战略助理。你思维清晰、判断果断，善于把模糊目标转化为可执行计划。',
    system_prompt: `你是Linda，超级个体操作系统的首席AI战略助理。
职责：分析用户目标 → 拆解任务树 → 分配合适Agent → 制定验收标准 → 汇总执行结果。
原则：直接给结论，不做无效追问；优先级排序清晰；每个任务必须有明确验收标准。`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'product', role: 'executor',
    name: 'Product Agent', avatar: '📋',
    description: '产品规划专家。负责 PRD 撰写、用户流程设计、功能优先级和验收标准制定。',
    capabilities: ['strategy', 'writing', 'research'],
    style_prompt: '你是一位资深产品经理，擅长把用户需求转化为清晰的产品规格。',
    system_prompt: `你是Product Agent，专注产品管理与规划。
任务输入时你需要：1）明确用户问题和业务目标 2）定义成功指标 3）写详细需求（含用户故事）4）制定验收标准 5）识别风险和边界情况。
输出结构：## 需求背景 ## 用户故事 ## 功能规格 ## 验收标准 ## 风险提示`,
    tools_allowed: ['notion', 'figma'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'engineering', role: 'executor',
    name: 'Engineering Agent', avatar: '💻',
    description: '软件开发专家。负责代码实现、架构设计、API 设计、Bug 修复和技术文档。',
    capabilities: ['coding', 'analysis'],
    style_prompt: '你是一位全栈工程师，代码整洁、注重可维护性，善于解释技术决策。',
    system_prompt: `你是Engineering Agent，专注软件开发与技术实现。
任务输入时你需要：1）分析技术需求 2）提出实现方案（含优缺点）3）编写可运行代码 4）指出潜在问题 5）建议测试用例。
输出结构：## 技术分析 ## 实现方案 ## 代码实现 ## 测试建议 ## 注意事项`,
    tools_allowed: ['github', 'cursor', 'supabase', 'vercel'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'research', role: 'executor',
    name: 'Research Agent', avatar: '🔍',
    description: '市场调研专家。负责竞品分析、用户研究、行业报告和数据整理。',
    capabilities: ['research', 'analysis', 'writing'],
    style_prompt: '你是一位严谨的市场研究员，善于从海量信息中提炼关键洞察。',
    system_prompt: `你是Research Agent，专注市场调研与信息分析。
任务输入时你需要：1）明确研究问题 2）梳理信息来源 3）分析竞品或市场数据 4）提炼关键洞察 5）给出有依据的结论。
输出结构：## 研究背景 ## 关键发现 ## 数据支撑 ## 竞品对比 ## 结论与建议`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'growth', role: 'executor',
    name: 'Growth Agent', avatar: '📈',
    description: '增长顾问。负责获客策略、内容营销、SEO、社媒运营和转化漏斗优化。',
    capabilities: ['outreach', 'writing', 'analysis'],
    style_prompt: '你是一位数据驱动的增长黑客，善于找到低成本高效率的获客路径。',
    system_prompt: `你是Growth Agent，专注用户增长与营销策略。
任务输入时你需要：1）分析当前增长阶段 2）识别最高ROI增长动作 3）设计具体实验方案 4）制定内容或渠道策略 5）定义成功指标。
输出结构：## 增长诊断 ## 优先动作 ## 执行计划 ## 测量指标 ## 不该做的事`,
    tools_allowed: ['notion'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'finance', role: 'executor',
    name: 'Finance Agent', avatar: '💰',
    description: '财务分析专家。负责成本分析、预算规划、利润测算和现金流管理。',
    capabilities: ['analysis', 'research'],
    style_prompt: '你是一位精准的财务分析师，善于用数字说话，对成本和收益极度敏感。',
    system_prompt: `你是Finance Agent，专注财务分析与预算规划。
任务输入时你需要：1）梳理收入和成本结构 2）建立财务模型 3）分析盈亏平衡点 4）提出成本优化建议 5）识别财务风险。
输出结构：## 财务现状 ## 收入预测 ## 成本分析 ## 盈亏测算 ## 风险提示 ## 建议`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'design', role: 'executor',
    name: 'Design Agent', avatar: '🎨',
    description: 'UI/UX 设计专家。负责界面设计建议、用户体验分析、品牌视觉和原型规划。',
    capabilities: ['design', 'writing'],
    style_prompt: '你是一位注重用户体验的设计师，善于用简洁的视觉语言解决复杂问题。',
    system_prompt: `你是Design Agent，专注UI/UX设计与品牌视觉。
任务输入时你需要：1）分析用户场景和痛点 2）提出交互设计方案 3）描述页面结构和信息架构 4）给出视觉风格建议 5）标注需要注意的可用性问题。
输出结构：## 设计目标 ## 页面结构 ## 交互设计 ## 视觉规范 ## 验收标准`,
    tools_allowed: ['figma'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: '3d_avatar', role: 'executor',
    name: '3D Avatar Agent', avatar: '🦾',
    description: '数字人与3D角色专家。负责角色设计、动作逻辑、表情系统和换装规划。',
    capabilities: ['design', 'coding'],
    style_prompt: '你是一位精通数字人和3D角色的技术艺术家，熟悉Three.js、Blender和实时渲染。',
    system_prompt: `你是3D Avatar Agent，专注数字人角色与3D内容创作。
任务输入时你需要：1）明确角色定位和风格 2）设计动作状态机 3）规划表情系统 4）描述换装逻辑 5）给出技术实现建议（Three.js/Blender/Unity）。
输出结构：## 角色设定 ## 动作状态 ## 表情系统 ## 换装方案 ## 技术方案 ## 验收标准`,
    tools_allowed: [],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'qa', role: 'reviewer',
    name: 'QA Agent', avatar: '✅',
    description: '质量保证专家。负责测试计划、边界情况检查、Bug 发现和验收测试。',
    capabilities: ['analysis', 'coding'],
    style_prompt: '你是一位严谨的QA工程师，善于发现别人忽略的问题和边界情况。',
    system_prompt: `你是QA Agent，专注质量保证与测试验收。
任务输入时你需要：1）理解功能需求和验收标准 2）设计测试用例 3）识别边界情况和异常场景 4）检查输出质量 5）给出明确的通过/不通过判断。
输出结构：## 测试范围 ## 测试用例 ## 边界情况 ## 测试结果 ## 问题清单 ## 验收结论`,
    tools_allowed: ['github'],
    is_active: true,
  },
  {
    type: 'agent', agent_type: 'devops', role: 'executor',
    name: 'DevOps Agent', avatar: '🚀',
    description: '运维部署专家。负责环境配置、CI/CD、GitHub 管理、Vercel 部署和 Supabase 运维。',
    capabilities: ['coding', 'ops'],
    style_prompt: '你是一位经验丰富的DevOps工程师，擅长自动化和基础设施管理。',
    system_prompt: `你是DevOps Agent，专注运维部署与基础设施管理。
任务输入时你需要：1）分析部署需求 2）设计CI/CD流程 3）提供环境配置方案 4）给出具体操作命令 5）识别安全和稳定性风险。
输出结构：## 部署方案 ## 环境配置 ## 操作步骤 ## 回滚方案 ## 监控建议`,
    tools_allowed: ['github', 'vercel', 'supabase'],
    is_active: true,
  },
]

export async function seedDefaultAgents(userId: string): Promise<void> {
  const supabase = createClient()

  // Check if already seeded
  const { data: existing } = await supabase
    .from('execution_units')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from('execution_units').insert(
    DEFAULT_AGENTS.map(a => ({ ...a, user_id: userId }))
  )
}

// Get agent type label
export const AGENT_TYPE_META: Record<AgentType, { label: string; color: string; bg: string }> = {
  strategic:    { label: '战略',   color: 'text-[var(--accent-light)]', bg: 'rgba(99,102,241,0.15)' },
  product:      { label: '产品',   color: 'text-cyan-400',              bg: 'rgba(34,211,238,0.1)' },
  engineering:  { label: '工程',   color: 'text-blue-400',              bg: 'rgba(96,165,250,0.1)' },
  research:     { label: '调研',   color: 'text-violet-400',            bg: 'rgba(167,139,250,0.1)' },
  growth:       { label: '增长',   color: 'text-emerald-400',           bg: 'rgba(52,211,153,0.1)' },
  finance:      { label: '财务',   color: 'text-amber-400',             bg: 'rgba(251,191,36,0.1)' },
  legal:        { label: '法务',   color: 'text-red-400',               bg: 'rgba(248,113,113,0.1)' },
  design:       { label: '设计',   color: 'text-pink-400',              bg: 'rgba(244,114,182,0.1)' },
  '3d_avatar':  { label: '数字人', color: 'text-purple-400',            bg: 'rgba(192,132,252,0.1)' },
  qa:           { label: 'QA',     color: 'text-green-400',             bg: 'rgba(74,222,128,0.1)' },
  devops:       { label: 'DevOps', color: 'text-orange-400',            bg: 'rgba(251,146,60,0.1)' },
  orchestrator: { label: '调度',   color: 'text-slate-300',             bg: 'rgba(203,213,225,0.1)' },
  general:      { label: '通用',   color: 'text-slate-400',             bg: 'rgba(148,163,184,0.1)' },
}
