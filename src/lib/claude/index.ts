import { PERSONA } from './persona'
import { MODE_PROMPTS, AIMode } from './modes'
import { OUTPUT_TEMPLATE } from './templates'
import type { DecisionSignal } from '@/lib/ai/decision-engine'

export type { AIMode } from './modes'
export { MODE_LABELS } from './modes'
export { buildUserContext } from './context'

export function buildSystemPrompt(
  mode: AIMode,
  contextPrompt: string,
  signal?: DecisionSignal
): string {
  const signalBlock = signal ? `
## Decision Engine 分析结果（已自动检测）

- 当前阶段：${signal.currentStage}
- 检测到风险：${signal.riskFlags.map(r => `${r.label}（${r.severity}）`).join('、') || '无明显风险'}
- 推荐框架：${signal.recommendedFramework}
- 必须输出的模块：${signal.requiredOutputBlocks.join('、')}
- 是否追问：${signal.shouldAskFollowUp ? `是，最多 ${signal.maxFollowUpQuestions} 个问题` : '否，直接给出判断'}

**重要：你的输出必须包含上述所有模块。风险等级 high 的问题必须在输出开头明确指出。**
` : ''

  return [
    PERSONA,
    '\n---\n',
    MODE_PROMPTS[mode] ?? MODE_PROMPTS.ceo,
    '\n---\n',
    signalBlock,
    '\n---\n',
    contextPrompt,
    '\n---\n',
    OUTPUT_TEMPLATE,
  ].join('\n')
}
