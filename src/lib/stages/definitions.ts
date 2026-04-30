// ─────────────────────────────────────────────────
// V1.9 — Stage Engine: 11-stage business lifecycle
// Hardcoded for MVP (V2 may move to DB for per-user customization)
// ─────────────────────────────────────────────────

export interface StageDef {
  id: number
  key: string
  name_zh: string
  name_en: string
  short: string                              // 一句话本质
  goal: string                               // 这个阶段在做什么
  success_criteria: string                   // 怎么算完成
  required_artifact_types: string[]          // 进下一阶段必须的 artifact 类型
  recommended_agents: string[]               // 推荐启用的 agent_type
  default_metric?: { name: string; target: number; label: string }
  can_skip: boolean                          // 部分阶段可跳过（如 prototype 对纯工具产品）
  outcome_options?: Array<'succeeded' | 'failed' | 'pivoted' | 'manual'>  // stage 10 用
}

export const STAGES: StageDef[] = [
  {
    id: 1,
    key: 'discover_needs',
    name_zh: '洞察需求',
    name_en: 'Discover Needs',
    short: '找到值得做的事',
    goal: '通过用户访谈、观察、竞品扫描，识别真实存在的痛点',
    success_criteria: '至少 1 份调研产物 + 3 条记忆（goal/risk/preference）',
    required_artifact_types: ['research_report'],
    recommended_agents: ['research', 'strategic'],
    can_skip: false,
  },
  {
    id: 2,
    key: 'refine_needs',
    name_zh: '打磨需求',
    name_en: 'Refine Needs',
    short: '把模糊变清晰',
    goal: '用 5W2H / JTBD 反复追问，把模糊想法变成可验证假设',
    success_criteria: '记忆里至少 1 条 goal + 1 条 preference + 1 条 risk',
    required_artifact_types: [],
    recommended_agents: ['strategic', 'research', 'product'],
    can_skip: false,
  },
  {
    id: 3,
    key: 'requirements_doc',
    name_zh: '总结需求文档',
    name_en: 'PRD Draft',
    short: '把想法落字',
    goal: '把打磨后的需求落成 PRD（可被工程团队执行）',
    success_criteria: '至少 1 份 markdown_doc artifact',
    required_artifact_types: ['markdown_doc'],
    recommended_agents: ['product', 'strategic'],
    can_skip: false,
  },
  {
    id: 4,
    key: 'prototype',
    name_zh: '做产品原型图',
    name_en: 'Prototype',
    short: '让别人看到长啥样',
    goal: '产出页面结构 + 交互说明 + 风格规范',
    success_criteria: '至少 1 份 design_spec artifact',
    required_artifact_types: ['design_spec'],
    recommended_agents: ['design', 'product'],
    can_skip: true,                            // 工具/API 类产品可跳过
  },
  {
    id: 5,
    key: 'features',
    name_zh: '做产品功能',
    name_en: 'Build Features',
    short: '逐个实现',
    goal: '把 PRD 里的功能逐个实现，本地跑通',
    success_criteria: '至少 1 个 code_pr artifact',
    required_artifact_types: ['code_pr'],
    recommended_agents: ['engineering', 'qa', 'devops'],
    can_skip: false,
  },
  {
    id: 6,
    key: 'mvp',
    name_zh: '做出 MVP',
    name_en: 'Ship MVP',
    short: '集成上线',
    goal: '把所有核心功能集成、部署，让外部用户能访问',
    success_criteria: 'MVP 部署完成（建议关联部署 URL）',
    required_artifact_types: ['code_pr'],
    recommended_agents: ['engineering', 'devops', 'qa'],
    can_skip: false,
  },
  {
    id: 7,
    key: 'validate_mvp',
    name_zh: '验证 MVP',
    name_en: 'Validate MVP',
    short: '看假设是否成立',
    goal: '通过 5–10 个种子用户测试核心假设',
    success_criteria: '至少 5 条 success/failure 类记忆',
    required_artifact_types: [],
    recommended_agents: ['research', 'strategic', 'growth'],
    default_metric: { name: 'beta_users', target: 10, label: '种子用户数' },
    can_skip: false,
  },
  {
    id: 8,
    key: 'first_users',
    name_zh: '找到首批用户',
    name_en: 'First Users',
    short: '0 → 100',
    goal: '从早期种子扩展到第一波付费/活跃用户',
    success_criteria: '北极星指标达到目标（默认 100）',
    required_artifact_types: [],
    recommended_agents: ['growth', 'strategic'],
    default_metric: { name: 'active_users', target: 100, label: '活跃用户数' },
    can_skip: false,
  },
  {
    id: 9,
    key: 'monetize',
    name_zh: '设计变现点',
    name_en: 'Design Monetization',
    short: '让钱开始流',
    goal: '设计定价 / 付费墙 / 价值指标，启动至少 1 个变现实验',
    success_criteria: '记忆里至少 1 条 decision（定价/付费相关）',
    required_artifact_types: [],
    recommended_agents: ['finance', 'growth', 'strategic'],
    can_skip: false,
  },
  {
    id: 10,
    key: 'validate_business',
    name_zh: '验证商业模式',
    name_en: 'Validate Business',
    short: 'go / no-go',
    goal: '判断变现能否跑通，决定 succeeded / failed / pivoted',
    success_criteria: '一个明确的 outcome 决策（写入 stage_history）',
    required_artifact_types: [],
    recommended_agents: ['strategic', 'finance'],
    can_skip: false,
    outcome_options: ['succeeded', 'failed', 'pivoted'],
  },
  {
    id: 11,
    key: 'go_to_market',
    name_zh: '投放市场',
    name_en: 'Go To Market',
    short: '正式 launch',
    goal: '正式发布 + 渠道铺开，进入可复制的增长',
    success_criteria: 'GTM 计划文档 + 至少 1 个渠道实验',
    required_artifact_types: ['markdown_doc'],
    recommended_agents: ['growth', 'devops', 'engineering'],
    can_skip: false,
  },
]

export function getStage(id: number): StageDef | null {
  return STAGES.find(s => s.id === id) ?? null
}

export function getNextStage(id: number): StageDef | null {
  return STAGES.find(s => s.id === id + 1) ?? null
}

export function getPrevStage(id: number): StageDef | null {
  return STAGES.find(s => s.id === id - 1) ?? null
}

export const TOTAL_STAGES = STAGES.length
