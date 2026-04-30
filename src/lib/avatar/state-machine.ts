import type { AvatarState, AvatarAction } from './types'

// ─────────────────────────────────────────────────
// Action duration in ms; null = looping (until next action)
// ─────────────────────────────────────────────────
export const ACTION_DURATION_MS: Record<AvatarAction, number | null> = {
  idle:  null,
  wave:  2400,
  nod:   1400,
  happy: 1800,
  sad:   2200,
}

export const DEFAULT_ACTION: AvatarAction = 'idle'

/**
 * Compute the next state given a transition request.
 * One-shot actions auto-revert to idle after their duration.
 */
export function applyAction(state: AvatarState, action: AvatarAction): AvatarState {
  return { ...state, action }
}

/**
 * Schedule auto-return to idle for one-shot actions.
 * Returns a teardown fn (to clear timer if state changes again).
 */
export function scheduleAutoReturn(
  action: AvatarAction,
  onReturn: () => void,
): (() => void) | null {
  const ms = ACTION_DURATION_MS[action]
  if (ms === null) return null
  const t = setTimeout(onReturn, ms)
  return () => clearTimeout(t)
}
