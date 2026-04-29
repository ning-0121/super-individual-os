export type RiskFlag = {
  code: string
  label: string
  severity: 'high' | 'medium' | 'low'
  description: string
}

export type DecisionSignal = {
  detectedMode: 'ceo' | 'coo' | 'growth' | 'general'
  currentStage: string
  riskFlags: RiskFlag[]
  recommendedFramework: string
  requiredOutputBlocks: string[]
  shouldAskFollowUp: boolean
  maxFollowUpQuestions: number
}

interface RawData {
  userInput: string
  goals?: string
  currentFocus?: string
  onboardingPain?: string
  activeProjectCount: number
  totalTaskCount: number
  overdueTaskCount: number
  memoryContents: string[]
}

// ─── Mode Detection ──────────────────────────────────────
function detectMode(input: string): DecisionSignal['detectedMode'] {
  const lower = input.toLowerCase()
  const strategicKw = ['先做什么', '优先级', '哪个更重要', '应该做', '押注', 'stop', 'continue', '放弃', '聚焦', '战略', '方向']
  const executionKw = ['怎么做', '拆解', '计划', '90天', '30天', 'sop', '步骤', '执行', '任务', '周计划', '安排']
  const growthKw = ['流量', '增长', '销售', '获客', '转化', '用户', '推广', '内容', '渠道', '变现']

  const strategic = strategicKw.filter(k => lower.includes(k)).length
  const execution = executionKw.filter(k => lower.includes(k)).length
  const growth = growthKw.filter(k => lower.includes(k)).length

  if (strategic === 0 && execution === 0 && growth === 0) return 'general'
  if (strategic >= execution && strategic >= growth) return 'ceo'
  if (execution >= growth) return 'coo'
  return 'growth'
}

// ─── Stage Detection ─────────────────────────────────────
function detectStage(data: RawData): string {
  if (!data.goals && !data.currentFocus) return '早期探索期（目标未明确）'
  if (data.activeProjectCount === 0) return '准备期（无活跃项目）'
  if (data.activeProjectCount === 1) return '单点突破期'
  if (data.activeProjectCount <= 3) return '多线并进期（需注意聚焦）'
  return '注意力分散期（需要做减法）'
}

// ─── Risk Rules ──────────────────────────────────────────
function detectRisks(data: RawData): RiskFlag[] {
  const flags: RiskFlag[] = []

  if (data.activeProjectCount > 3) {
    flags.push({
      code: 'attention_overload',
      label: '注意力分散',
      severity: 'high',
      description: `当前有 ${data.activeProjectCount} 个活跃项目，超过个人有效管理上限（3个）`,
    })
  }

  if (data.overdueTaskCount > 5) {
    flags.push({
      code: 'execution_drift',
      label: '执行偏差',
      severity: 'high',
      description: `${data.overdueTaskCount} 个任务积压未完成，执行系统出现问题`,
    })
  }

  if (!data.currentFocus) {
    flags.push({
      code: 'lack_of_focus',
      label: '缺乏聚焦',
      severity: 'medium',
      description: '当前没有设置唯一重点目标，容易陷入无效忙碌',
    })
  }

  if (data.activeProjectCount > 1) {
    flags.push({
      code: 'resource_spread',
      label: '资源分散',
      severity: 'medium',
      description: '多个项目同时处于 active 状态，资源可能被稀释',
    })
  }

  const cashflowKw = ['cashflow', '现金流', '收入', '亏损', '资金', '烧钱', '断粮']
  const hasCashflowRisk = data.memoryContents.some(c =>
    cashflowKw.some(k => c.toLowerCase().includes(k))
  )
  if (hasCashflowRisk) {
    flags.push({
      code: 'cashflow_sensitive',
      label: '现金流敏感',
      severity: 'high',
      description: '历史记录中出现现金流相关内容，需要优先保障收入',
    })
  }

  if (data.totalTaskCount > 20) {
    flags.push({
      code: 'task_overload',
      label: '任务堆积',
      severity: 'low',
      description: `待完成任务 ${data.totalTaskCount} 个，建议清理低价值任务`,
    })
  }

  return flags
}

// ─── Framework & Output Blocks ───────────────────────────
function recommendFramework(mode: DecisionSignal['detectedMode'], risks: RiskFlag[]): string {
  const hasOverload = risks.some(r => r.code === 'attention_overload' || r.code === 'resource_spread')
  if (mode === 'ceo' && hasOverload) return 'Stop/Continue/Pivot 决策框架 + 资源重新配置'
  if (mode === 'ceo') return 'CEO 战略判断框架：优先级 + 资源配置 + 风险识别'
  if (mode === 'coo') return 'OKR 执行拆解：目标 → 关键结果 → 具体任务 → 验收标准'
  if (mode === 'growth') return 'Growth Loop 框架：获客 → 激活 → 留存 → 变现 → 推荐'
  return '综合判断框架：现状分析 → 问题识别 → 优先行动'
}

function requiredBlocks(mode: DecisionSignal['detectedMode']): string[] {
  if (mode === 'ceo') return [
    '当前阶段判断', '核心矛盾', '优先级排序表',
    '资源配置建议', 'Stop/Continue/Pivot', '风险预警',
    '7天动作', '30天目标', '90天目标',
  ]
  if (mode === 'coo') return [
    '当前执行状态', '任务拆解表', '必须先做 vs 可以后做',
    'AI可执行任务', '本周唯一重点', '验收标准',
  ]
  if (mode === 'growth') return [
    '当前增长阶段', '最高优先级增长动作',
    '渠道分析表', '下一步测试计划', '不应该做的增长动作',
  ]
  return ['现状判断', '核心问题', '建议行动', '风险提示']
}

// ─── Main ───────────────────────────────────────────────
export function runDecisionEngine(data: RawData): DecisionSignal {
  const mode = detectMode(data.userInput)
  const stage = detectStage(data)
  const risks = detectRisks(data)
  const framework = recommendFramework(mode, risks)
  const blocks = requiredBlocks(mode)

  return {
    detectedMode: mode,
    currentStage: stage,
    riskFlags: risks,
    recommendedFramework: framework,
    requiredOutputBlocks: blocks,
    shouldAskFollowUp: risks.length > 2 || mode === 'general',
    maxFollowUpQuestions: risks.length > 2 ? 2 : 1,
  }
}
