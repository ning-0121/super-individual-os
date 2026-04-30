import type { AvatarState, AvatarLLMOutput, AvatarMood, AvatarExpression, AvatarAction } from './types'

const VALID_MOODS:       AvatarMood[]       = ['happy', 'neutral', 'sad', 'angry', 'excited', 'tired']
const VALID_EXPRESSIONS: AvatarExpression[] = ['neutral', 'smile', 'angry', 'sad', 'surprised']
const VALID_ACTIONS:     AvatarAction[]     = ['idle', 'wave', 'nod', 'happy', 'sad']

// ─────────────────────────────────────────────────
// Parse LLM JSON output → validated AvatarLLMOutput
// ─────────────────────────────────────────────────
export function parseLLMAvatarOutput(raw: unknown): AvatarLLMOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const out: AvatarLLMOutput = {}

  if (typeof obj.mood === 'string'       && (VALID_MOODS       as string[]).includes(obj.mood))       out.mood       = obj.mood       as AvatarMood
  if (typeof obj.expression === 'string' && (VALID_EXPRESSIONS as string[]).includes(obj.expression)) out.expression = obj.expression as AvatarExpression
  if (typeof obj.action === 'string'     && (VALID_ACTIONS     as string[]).includes(obj.action))     out.action     = obj.action     as AvatarAction
  if (typeof obj.reason === 'string') out.reason = obj.reason

  // Reject empty
  if (!out.mood && !out.expression && !out.action) return null
  return out
}

export function applyLLMOutput(current: AvatarState, output: AvatarLLMOutput): AvatarState {
  return {
    ...current,
    ...(output.mood       && { mood:       output.mood }),
    ...(output.expression && { expression: output.expression }),
    ...(output.action     && { action:     output.action }),
  }
}

// ─────────────────────────────────────────────────
// Local keyword heuristic — used when no LLM is available
// (also useful as a fast cache / fallback path)
// ─────────────────────────────────────────────────
export function suggestFromText(text: string): AvatarLLMOutput {
  const t = text.toLowerCase()
  const out: AvatarLLMOutput = {}

  if (/(happy|joy|excited|great|awesome|love|赞|开心|高兴)/.test(t)) {
    out.mood = 'happy'
    out.expression = 'smile'
    out.action = 'happy'
  } else if (/(sad|cry|sorry|disappoint|难过|失望|抱歉)/.test(t)) {
    out.mood = 'sad'
    out.expression = 'sad'
    out.action = 'sad'
  } else if (/(angry|mad|frustrat|生气|愤怒|烦)/.test(t)) {
    out.mood = 'angry'
    out.expression = 'angry'
  } else if (/(wow|surprise|whoa|amazing|惊|哇|不会吧)/.test(t)) {
    out.expression = 'surprised'
    out.mood = 'excited'
  } else if (/(hi|hello|hey|wave|嗨|你好|hi！)/.test(t)) {
    out.action = 'wave'
    out.expression = 'smile'
  } else if (/(yes|agree|nod|ok|对|赞同|可以)/.test(t)) {
    out.action = 'nod'
  } else if (/(tired|sleepy|累|困)/.test(t)) {
    out.mood = 'tired'
  }

  return out
}

// ─────────────────────────────────────────────────
// Build LLM prompt for avatar driving (V1 — used in API route)
// ─────────────────────────────────────────────────
export function buildAvatarSystemPrompt(): string {
  return `你是一个虚拟玩偶 Auralie 的情绪/动作控制器。

根据用户消息或上下文，输出 JSON 控制玩偶的状态。

合法值：
- mood: ${VALID_MOODS.join(' | ')}
- expression: ${VALID_EXPRESSIONS.join(' | ')}
- action: ${VALID_ACTIONS.join(' | ')}

输出严格 JSON（无 markdown 代码块）：
{
  "mood": "...",
  "expression": "...",
  "action": "...",
  "reason": "为什么这样反应（不超过 30 字）"
}

规则：
- 必须至少填一个字段
- action 是一次性动作（wave / nod / happy / sad）；idle 表示待机
- expression 是持续表情；mood 是底色情绪
- 只输出 JSON，前后不加任何文字`
}
