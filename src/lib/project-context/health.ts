// ─────────────────────────────────────────────────
// V2.5+ — Project Operating Layer — pure scorers.
// All functions deterministic and side-effect-free.
// ─────────────────────────────────────────────────

export type ProjectHealthStatus = 'healthy' | 'warning' | 'critical'

export interface HealthInputs {
  total_tasks: number
  completed_tasks: number
  blocked_tasks: number
  activity_count_7d: number
  has_next_actions: boolean
  has_locked_context: boolean
}

export interface HealthBreakdown {
  task_completion_pts: number     // out of 30
  recent_activity_pts: number     // out of 20
  blocked_penalty_pts: number     // out of 20 (more blocked → smaller)
  next_actions_pts: number        // out of 15
  locked_context_pts: number      // out of 15
}

export interface HealthScore {
  score: number                   // 0..100
  status: ProjectHealthStatus
  breakdown: HealthBreakdown
}

// ─────────────────────────────────────────────────
// Score formula per spec:
//   30% task completion
//   20% recent activity (7d)
//   20% blocked tasks (reverse)
//   15% has next_actions
//   15% has locked context
// ─────────────────────────────────────────────────
export function computeHealthScore(input: HealthInputs): HealthScore {
  // 1. Task completion (0..30)
  const completion_ratio = input.total_tasks > 0
    ? input.completed_tasks / input.total_tasks
    : 0
  // If project has zero tasks, treat as 0 completion (incomplete = low signal)
  const task_completion_pts = Math.round(completion_ratio * 30)

  // 2. Recent activity (0..20) — saturates at 10 activities/week
  const activity_norm = Math.min(input.activity_count_7d, 10) / 10
  const recent_activity_pts = Math.round(activity_norm * 20)

  // 3. Blocked task penalty (0..20) — full points at 0 blocked,
  //    drops linearly; 5+ blocked → 0 points
  const blocked_norm = 1 - Math.min(input.blocked_tasks, 5) / 5
  const blocked_penalty_pts = Math.round(blocked_norm * 20)

  // 4. Has next actions (0/15)
  const next_actions_pts = input.has_next_actions ? 15 : 0

  // 5. Has locked context (0/15)
  const locked_context_pts = input.has_locked_context ? 15 : 0

  const score = task_completion_pts + recent_activity_pts + blocked_penalty_pts
              + next_actions_pts + locked_context_pts

  let status: ProjectHealthStatus = 'healthy'
  if (score < 40) status = 'critical'
  else if (score < 65) status = 'warning'

  return {
    score,
    status,
    breakdown: {
      task_completion_pts,
      recent_activity_pts,
      blocked_penalty_pts,
      next_actions_pts,
      locked_context_pts,
    },
  }
}

// ─────────────────────────────────────────────────
// Stop / Continue / Pivot — pure advisor.
// Used inline on the Operating Dashboard.
// ─────────────────────────────────────────────────
export type ContinueAdvice = 'stop' | 'continue' | 'pivot'

export interface AdviceInputs {
  health_status: ProjectHealthStatus
  blocked_tasks: number
  activity_count_7d: number
  has_next_actions: boolean
  completion_ratio: number       // 0..1
  hours_since_last_activity: number
}

export interface Advice {
  recommendation: ContinueAdvice
  reason: string
  confidence: number             // 0..1
}

export function suggestStopContinuePivot(input: AdviceInputs): Advice {
  // STOP: no activity in 2+ weeks AND no completed work, or extreme stall
  if (input.hours_since_last_activity >= 14 * 24 && input.completion_ratio < 0.1) {
    return {
      recommendation: 'stop',
      reason: '已经 2 周以上没有活动且没有任何完成事项 — 建议正式归档或停掉。',
      confidence: 0.85,
    }
  }

  // PIVOT: lots of blockers but some activity, or sustained warning state
  // with rising blocks
  if (input.blocked_tasks >= 4 && input.health_status === 'warning') {
    return {
      recommendation: 'pivot',
      reason: '阻塞项堆积、但项目仍在动 — 当前路径可能错了，考虑换方向或砍范围。',
      confidence: 0.7,
    }
  }
  if (input.health_status === 'critical' && input.blocked_tasks >= 3) {
    return {
      recommendation: 'pivot',
      reason: 'critical 状态 + 多项阻塞 — 当前打法走不通，必须 pivot 或暂停。',
      confidence: 0.75,
    }
  }

  // CONTINUE (default): healthy or warning-but-moving
  if (input.health_status === 'healthy') {
    return {
      recommendation: 'continue',
      reason: '健康度良好，继续按当前节奏推进 next actions。',
      confidence: 0.85,
    }
  }

  if (input.has_next_actions && input.activity_count_7d >= 2) {
    return {
      recommendation: 'continue',
      reason: '虽有警告但仍有活动 + 明确下一步 — 先把 next action 推完再判定。',
      confidence: 0.6,
    }
  }

  // Otherwise: continue with warning
  return {
    recommendation: 'continue',
    reason: '继续推进，但下个周期需要明确 next actions 并清掉阻塞。',
    confidence: 0.5,
  }
}

// ─────────────────────────────────────────────────
// Focus Guard — does a task title align with the project goal?
// Simple keyword-overlap heuristic. V1 design: high precision,
// low recall (only flags clearly off-focus titles).
// ─────────────────────────────────────────────────
export interface FocusInputs {
  task_title: string
  task_description?: string
  project_goal: string
  current_focus?: string
}

export interface FocusVerdict {
  off_focus: boolean
  similarity: number            // 0..1
  reason?: string
}

// Tokenize: lowercase, strip punctuation, drop short / stop words.
// Handles English (split on whitespace) and Chinese (per-character chunks).
const STOP_WORDS = new Set([
  'the','a','an','to','of','in','on','for','and','or','is','are','it','this','that',
  '的','了','和','是','在','给','为','把','与','也',
])

function tokenize(text: string): Set<string> {
  if (!text) return new Set()
  const cleaned = text.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ')
  const tokens = new Set<string>()
  // English-style words
  for (const w of cleaned.split(/\s+/)) {
    if (w.length >= 3 && !STOP_WORDS.has(w)) tokens.add(w)
  }
  // CJK bigrams (length-2 sliding window)
  const cjkOnly = text.match(/[一-龥]+/g) ?? []
  for (const seg of cjkOnly) {
    for (let i = 0; i < seg.length - 1; i++) {
      const bigram = seg.slice(i, i + 2)
      if (!STOP_WORDS.has(bigram)) tokens.add(bigram)
    }
    // also keep solo chars if segment is length 1
    if (seg.length === 1) tokens.add(seg)
  }
  return tokens
}

export function assessTaskFocus(input: FocusInputs): FocusVerdict {
  const goal = input.project_goal ?? ''
  const focus = input.current_focus ?? ''
  const title = input.task_title ?? ''
  const desc = input.task_description ?? ''

  // No goal set → can't judge, default to in-focus
  const goalTokens = tokenize(goal + ' ' + focus)
  if (goalTokens.size === 0) {
    return { off_focus: false, similarity: 1, reason: 'No project goal set; skipping focus check.' }
  }

  const taskTokens = tokenize(title + ' ' + desc)
  if (taskTokens.size === 0) {
    return { off_focus: false, similarity: 1, reason: 'Empty task — skipping focus check.' }
  }

  // Jaccard-ish: intersect / |task tokens|
  let overlap = 0
  for (const t of taskTokens) if (goalTokens.has(t)) overlap++
  const similarity = overlap / taskTokens.size

  // V1 threshold: < 0.15 overlap → off focus
  if (similarity < 0.15) {
    return {
      off_focus: true,
      similarity,
      reason: '任务和当前项目目标 / focus 几乎没有共同关键词 — 可能偏离当前 focus。',
    }
  }
  return { off_focus: false, similarity }
}

// ─────────────────────────────────────────────────
// Health-aware directive for the AI prompt block.
// Returned string is appended to the locked project block when health
// is warning or critical.
// ─────────────────────────────────────────────────
export function buildHealthDirective(status: ProjectHealthStatus): string | null {
  if (status === 'healthy') return null
  return [
    '',
    '### Health Directive',
    `该项目当前处于 **${status}** 状态。`,
    '优先处理阻塞和下一步，不要建议扩展新功能。',
    '若用户提出新方向，先评估是否会让 health 进一步下降。',
  ].join('\n')
}
