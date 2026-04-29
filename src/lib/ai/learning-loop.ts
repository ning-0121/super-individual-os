import { SupabaseClient } from '@supabase/supabase-js'
import type { DecisionSignal } from './decision-engine'
import type { AIContext } from './context-engine'

export type Feedback = 'helpful' | 'neutral' | 'not_helpful'

// ─────────────────────────────────────────────────
// 1. Extract action items from AI output
// ─────────────────────────────────────────────────
export function extractActionItems(
  text: string
): { item: string; timeframe: '7days' | '30days' | '90days' | 'general' }[] {
  const results: { item: string; timeframe: '7days' | '30days' | '90days' | 'general' }[] = []

  // Split into sections by ## headers
  const sections = text.split(/\n(?=##\s)/g)

  for (const section of sections) {
    const headerMatch = section.match(/^##\s+(.+)/)
    if (!headerMatch) continue
    const header = headerMatch[1]

    let timeframe: '7days' | '30days' | '90days' | 'general' = 'general'
    if (/7\s*天/.test(header))  timeframe = '7days'
    else if (/30\s*天/.test(header)) timeframe = '30days'
    else if (/90\s*天/.test(header)) timeframe = '90days'
    else if (!/(风险|阶段|矛盾|排序|配置|资源|分析|判断)/.test(header)) continue

    const bullets = section.match(/^[-•]\s+.+$/gm) ?? []
    const numbered = section.match(/^\d+\.\s+.+$/gm) ?? []

    ;[...bullets, ...numbered].forEach(line => {
      const item = line.replace(/^[-•\d.]\s+/, '').trim()
      if (item.length > 5) results.push({ item, timeframe })
    })
  }

  // Deduplicate
  const seen = new Set<string>()
  return results.filter(r => {
    if (seen.has(r.item)) return false
    seen.add(r.item); return true
  })
}

// ─────────────────────────────────────────────────
// 2. Log decision + auto-extract execution items
// ─────────────────────────────────────────────────
export async function logDecision(
  supabase: SupabaseClient,
  params: {
    userId: string
    conversationId: string | null
    mode: string
    userInput: string
    aiOutput: string
    signal: DecisionSignal
    context: AIContext
  }
): Promise<string | null> {
  // Insert decision log
  const { data: log, error } = await supabase
    .from('decision_logs')
    .insert({
      user_id:        params.userId,
      conversation_id: params.conversationId,
      mode:           params.mode,
      detected_mode:  params.signal.detectedMode,
      user_input:     params.userInput,
      ai_output:      params.aiOutput,
      risk_flags:     params.signal.riskFlags,
      context_ids:    params.context.rawContextIds,
    })
    .select('id')
    .single()

  if (error || !log) {
    console.error('[LearningLoop] logDecision error:', error)
    return null
  }

  // Extract + save action items
  const actions = extractActionItems(params.aiOutput)
  if (actions.length > 0) {
    await supabase.from('execution_logs').insert(
      actions.map(a => ({
        user_id:        params.userId,
        decision_log_id: log.id,
        action_item:    a.item,
        timeframe:      a.timeframe,
        status:         'pending',
      }))
    )
  }

  return log.id
}

// ─────────────────────────────────────────────────
// 3. Record user feedback + trigger pattern update
// ─────────────────────────────────────────────────
export async function recordOutcome(
  supabase: SupabaseClient,
  params: {
    userId: string
    decisionLogId: string
    feedback: Feedback
    note?: string
  }
): Promise<void> {
  // Save outcome
  await supabase.from('outcome_logs').insert({
    user_id:        params.userId,
    decision_log_id: params.decisionLogId,
    feedback:       params.feedback,
    note:           params.note ?? '',
  })

  // Fetch the decision log for context
  const { data: decLog } = await supabase
    .from('decision_logs')
    .select('detected_mode, risk_flags')
    .eq('id', params.decisionLogId)
    .single()

  if (decLog) {
    await updateLearningPatterns(supabase, params.userId, params.feedback, decLog)
  }
}

// ─────────────────────────────────────────────────
// 4. Update aggregated learning patterns
// ─────────────────────────────────────────────────
async function updateLearningPatterns(
  supabase: SupabaseClient,
  userId: string,
  feedback: Feedback,
  decLog: { detected_mode: string; risk_flags: unknown[] }
): Promise<void> {
  // Pattern A: mode_helpfulness
  const modeKey = decLog.detected_mode || 'general'
  const { data: existing } = await supabase
    .from('learning_patterns')
    .select('pattern_value')
    .eq('user_id', userId)
    .eq('pattern_type', 'mode_helpfulness')
    .eq('pattern_key', modeKey)
    .single()

  const prev = (existing?.pattern_value as Record<string, number>) ?? { helpful: 0, neutral: 0, not_helpful: 0 }
  const next = { ...prev, [feedback]: (prev[feedback] ?? 0) + 1 }

  await supabase.from('learning_patterns').upsert({
    user_id:      userId,
    pattern_type: 'mode_helpfulness',
    pattern_key:  modeKey,
    pattern_value: next,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'user_id,pattern_type,pattern_key' })

  // Pattern B: risk accuracy — if helpful, risks were real
  const riskFlags = (decLog.risk_flags as { code: string }[]) ?? []
  for (const risk of riskFlags) {
    const { data: rp } = await supabase
      .from('learning_patterns')
      .select('pattern_value')
      .eq('user_id', userId)
      .eq('pattern_type', 'risk_accuracy')
      .eq('pattern_key', risk.code)
      .single()

    const rPrev = (rp?.pattern_value as Record<string, number>) ?? { confirmed: 0, rejected: 0 }
    const rNext = feedback === 'helpful'
      ? { ...rPrev, confirmed: (rPrev.confirmed ?? 0) + 1 }
      : feedback === 'not_helpful'
        ? { ...rPrev, rejected: (rPrev.rejected ?? 0) + 1 }
        : rPrev

    await supabase.from('learning_patterns').upsert({
      user_id:      userId,
      pattern_type: 'risk_accuracy',
      pattern_key:  risk.code,
      pattern_value: rNext,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id,pattern_type,pattern_key' })
  }
}

// ─────────────────────────────────────────────────
// 5. Get learning insights for Dashboard
// ─────────────────────────────────────────────────
export type LearningInsights = {
  totalDecisions: number
  helpfulRate: number        // 0-100
  topMode: string
  topRisk: string | null
  actionsPending: number
  actionsDone: number
  recentFeedback: Feedback[]
}

export async function getLearningInsights(
  supabase: SupabaseClient,
  userId: string
): Promise<LearningInsights> {
  const [
    { data: decisions },
    { data: outcomes },
    { data: executions },
    { data: patterns },
  ] = await Promise.all([
    supabase.from('decision_logs').select('id, detected_mode').eq('user_id', userId),
    supabase.from('outcome_logs').select('feedback').eq('user_id', userId),
    supabase.from('execution_logs').select('status').eq('user_id', userId),
    supabase.from('learning_patterns').select('*').eq('user_id', userId),
  ])

  const total   = decisions?.length ?? 0
  const helpful = outcomes?.filter(o => o.feedback === 'helpful').length ?? 0
  const helpfulRate = total > 0 && outcomes && outcomes.length > 0
    ? Math.round((helpful / outcomes.length) * 100)
    : 0

  // Top mode
  const modeCounts: Record<string, number> = {}
  decisions?.forEach(d => {
    modeCounts[d.detected_mode ?? 'general'] = (modeCounts[d.detected_mode ?? 'general'] ?? 0) + 1
  })
  const topMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ceo'

  // Top risk (most confirmed)
  const riskPatterns = patterns?.filter(p => p.pattern_type === 'risk_accuracy') ?? []
  const topRiskEntry = riskPatterns
    .map(p => ({
      key: p.pattern_key,
      confirmed: (p.pattern_value as { confirmed?: number }).confirmed ?? 0
    }))
    .sort((a, b) => b.confirmed - a.confirmed)[0]

  const actionsPending = executions?.filter(e => e.status === 'pending').length ?? 0
  const actionsDone    = executions?.filter(e => e.status === 'done').length ?? 0

  const recentFeedback = (outcomes ?? []).slice(-5).map(o => o.feedback as Feedback)

  return {
    totalDecisions: total,
    helpfulRate,
    topMode,
    topRisk: topRiskEntry?.key ?? null,
    actionsPending,
    actionsDone,
    recentFeedback,
  }
}
