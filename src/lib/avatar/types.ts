// ─────────────────────────────────────────────────
// Auralie 3D Avatar — V1 type system
// ─────────────────────────────────────────────────

export type AvatarMood = 'happy' | 'neutral' | 'sad' | 'angry' | 'excited' | 'tired'
export type AvatarExpression = 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised'
export type AvatarAction = 'idle' | 'wave' | 'nod' | 'happy' | 'sad'
export type AvatarOutfit = 'default' | 'casual' | 'formal' | 'cyber' | 'cozy'
export type AvatarGrowthStage = 'seedling' | 'youth' | 'adult' | 'elder'

export interface AvatarState {
  mood: AvatarMood
  expression: AvatarExpression
  action: AvatarAction
  outfit: AvatarOutfit
  growth_stage: AvatarGrowthStage
}

export const DEFAULT_AVATAR_STATE: AvatarState = {
  mood: 'neutral',
  expression: 'neutral',
  action: 'idle',
  outfit: 'default',
  growth_stage: 'youth',
}

// ─────────────────────────────────────────────────
// LLM-driver interface
// ─────────────────────────────────────────────────
export interface AvatarLLMOutput {
  mood?: AvatarMood
  expression?: AvatarExpression
  action?: AvatarAction
  reason?: string
}

// ─────────────────────────────────────────────────
// Outfit / mood color palette
// (used by procedural avatar; VRM will use morphs/textures instead)
// ─────────────────────────────────────────────────
export const OUTFIT_COLORS: Record<AvatarOutfit, { body: string; accent: string }> = {
  default: { body: '#6366f1', accent: '#a78bfa' },     // indigo
  casual:  { body: '#22d3ee', accent: '#0e7490' },     // cyan
  formal:  { body: '#1e293b', accent: '#475569' },     // slate
  cyber:   { body: '#10b981', accent: '#34d399' },     // emerald w/ glow
  cozy:    { body: '#f59e0b', accent: '#fbbf24' },     // amber
}

export const GROWTH_SCALE: Record<AvatarGrowthStage, number> = {
  seedling: 0.6,
  youth:    0.85,
  adult:    1.0,
  elder:    0.95,
}

export const MOOD_AURA_COLOR: Record<AvatarMood, string> = {
  happy:    '#fbbf24',
  neutral:  '#94a3b8',
  sad:      '#60a5fa',
  angry:    '#f87171',
  excited:  '#f472b6',
  tired:    '#a78bfa',
}
