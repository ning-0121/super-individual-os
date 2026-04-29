import type { Task, ExecutionUnit, Capability } from '@/types'

// ─────────────────────────────────────────────────
// Rule sets
// ─────────────────────────────────────────────────

// Keywords → required capability
const CAPABILITY_RULES: { pattern: RegExp; capability: Capability }[] = [
  { pattern: /代码|编程|开发|debug|bug|api|接口|部署|上线|技术/i,  capability: 'coding' },
  { pattern: /写作|文案|内容|博客|邮件|文章|推文|发帖/i,            capability: 'writing' },
  { pattern: /调研|竞品|分析|数据|报告|研究|市场/i,                 capability: 'research' },
  { pattern: /战略|方向|决策|规划|路线|优先级/i,                    capability: 'strategy' },
  { pattern: /运营|流程|协调|执行|落地|跟进|管理/i,                 capability: 'ops' },
  { pattern: /推广|获客|营销|BD|合作|外联|联系/i,                   capability: 'outreach' },
  { pattern: /设计|UI|UX|视觉|原型|Figma/i,                        capability: 'design' },
  { pattern: /统计|建模|预测|excel|数据库|SQL/i,                    capability: 'analysis' },
]

// Keywords that strongly indicate human execution
const HUMAN_SIGNALS = /会议|谈判|签约|客户|演讲|见面|电话|拜访|关系|信任|判断|承诺/i

// ─────────────────────────────────────────────────
// Dispatch result
// ─────────────────────────────────────────────────
export type DispatchResult = {
  recommended: ExecutionUnit
  confidence: 'high' | 'medium' | 'low'
  reason: string
  requiredCapabilities: Capability[]
  alternatives: ExecutionUnit[]
}

// ─────────────────────────────────────────────────
// Main dispatch function
// ─────────────────────────────────────────────────
export function dispatch(task: Task, units: ExecutionUnit[]): DispatchResult | null {
  const active = units.filter(u => u.is_active)
  if (active.length === 0) return null

  const text = `${task.title} ${task.description ?? ''}`
  const requiredCaps = detectCapabilities(text)

  // Rule 1: High-stakes keywords → force human
  if (HUMAN_SIGNALS.test(text) || task.priority === 'must') {
    const human = active.find(u => u.type === 'human')
    if (human) {
      return {
        recommended: human,
        confidence: 'high',
        reason: task.priority === 'must'
          ? '高优先级任务，建议人工直接负责'
          : '检测到需要人际判断的场景，建议人工执行',
        requiredCapabilities: requiredCaps,
        alternatives: active.filter(u => u.id !== human.id).slice(0, 2),
      }
    }
  }

  // Rule 2: Match by capabilities
  const scored = active.map(unit => ({
    unit,
    score: scoreUnit(unit, requiredCaps, task),
  })).sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) return null

  const confidence: 'high' | 'medium' | 'low' =
    best.score >= 3 ? 'high' : best.score >= 1 ? 'medium' : 'low'

  const reason = buildReason(best.unit, requiredCaps, task)

  return {
    recommended: best.unit,
    confidence,
    reason,
    requiredCapabilities: requiredCaps,
    alternatives: scored.slice(1, 3).map(s => s.unit),
  }
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
function detectCapabilities(text: string): Capability[] {
  return CAPABILITY_RULES
    .filter(r => r.pattern.test(text))
    .map(r => r.capability)
}

function scoreUnit(unit: ExecutionUnit, required: Capability[], task: Task): number {
  let score = 0

  // Capability match
  const caps = unit.capabilities as Capability[]
  const matched = required.filter(c => caps.includes(c))
  score += matched.length * 2

  // Type bonuses
  if (unit.type === 'human') {
    // humans are better at must/important
    if (task.priority === 'must') score += 3
    if (task.priority === 'important') score += 1
  }
  if (unit.type === 'ai' || unit.type === 'agent') {
    // AI is better for optional / repetitive
    if (task.priority === 'optional') score += 2
    // AI with no required caps still gets a base score
    if (required.length === 0) score += 1
  }
  if (unit.type === 'agent') {
    // Specialised agents beat generic AI when there's a match
    if (matched.length > 0) score += 1
  }

  return score
}

function buildReason(unit: ExecutionUnit, caps: Capability[], task: Task): string {
  if (unit.type === 'human') {
    return `任务优先级为「${task.priority}」，建议人工确认执行`
  }
  if (caps.length > 0) {
    const capLabel: Record<Capability, string> = {
      writing: '写作', coding: '开发', research: '调研',
      strategy: '战略', ops: '运营', outreach: '外联',
      design: '设计', analysis: '数据分析',
    }
    const matched = caps.map(c => capLabel[c]).join('、')
    return `检测到${matched}场景，${unit.name} 最匹配`
  }
  return `${unit.name} 是当前最佳执行者`
}
