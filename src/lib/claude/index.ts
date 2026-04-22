import { PERSONA } from './persona'
import { MODE_PROMPTS, AIMode } from './modes'
import { OUTPUT_TEMPLATE } from './templates'

export type { AIMode } from './modes'
export { MODE_LABELS } from './modes'
export { buildUserContext } from './context'

export function buildSystemPrompt(mode: AIMode, userContext: string): string {
  return [
    PERSONA,
    '\n---\n',
    MODE_PROMPTS[mode] ?? MODE_PROMPTS.ceo,
    '\n---\n',
    userContext,
    '\n---\n',
    OUTPUT_TEMPLATE,
  ].join('\n')
}
