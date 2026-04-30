import type { SupabaseClient } from '@supabase/supabase-js'
import { STAGES, getStage, TOTAL_STAGES, type StageDef } from './definitions'

// ─────────────────────────────────────────────────
// Gate evaluation: can the user advance from currentStage → currentStage+1?
// ─────────────────────────────────────────────────

export interface MetricStatus {
  name: string
  label: string
  target: number
  current: number
  ok: boolean
}

export interface StageGateResult {
  stage: StageDef
  can_advance: boolean
  blockers: string[]                              // hard blockers (must resolve)
  warnings: string[]                              // soft warnings (advance allowed)
  artifacts_present: Record<string, number>       // by artifact_type
  memory_count: number
  metric_status: MetricStatus | null
}

export async function evaluateStageGate(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  stageId: number,
): Promise<StageGateResult> {
  const stage = getStage(stageId)
  if (!stage) {
    return {
      stage: STAGES[0],
      can_advance: false,
      blockers: ['Invalid stage id'],
      warnings: [],
      artifacts_present: {},
      memory_count: 0,
      metric_status: null,
    }
  }

  const blockers: string[] = []
  const warnings: string[] = []

  // Parallel fetch
  const [{ data: artifacts }, { count: memCount }, { data: project }] = await Promise.all([
    supabase.from('artifacts').select('artifact_type')
      .eq('user_id', userId).eq('project_id', projectId),
    supabase.from('memories').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('project_id', projectId),
    supabase.from('projects').select('north_star_target, north_star_current, north_star_metric')
      .eq('id', projectId).single(),
  ])

  // 1. Required artifacts
  const artifactCounts: Record<string, number> = {}
  for (const a of (artifacts ?? [])) {
    const t = String(a.artifact_type)
    artifactCounts[t] = (artifactCounts[t] ?? 0) + 1
  }

  for (const required of stage.required_artifact_types) {
    if (!artifactCounts[required]) {
      blockers.push(`缺少 "${required}" 类型的产出物`)
    }
  }

  // 2. Memory threshold for early stages (1, 2, 7)
  const mc = memCount ?? 0
  if ([1, 2, 7].includes(stageId) && mc < 1) {
    blockers.push('本阶段需要至少 1 条项目记忆作为洞察记录')
  }
  if (stageId === 1 && mc < 3) {
    warnings.push('建议至少积累 3 条记忆（goal / risk / preference）再进入下一阶段')
  }

  // 3. Metric check
  let metric_status: MetricStatus | null = null
  if (stage.default_metric) {
    const metricName = stage.default_metric.name
    // Use project's north_star_target/current if set, else fall back to stage default
    const targetRaw = project?.north_star_target as string | null | undefined
    const currentRaw = project?.north_star_current as string | null | undefined
    const target = targetRaw ? parseFloat(targetRaw) || stage.default_metric.target : stage.default_metric.target
    const current = currentRaw ? parseFloat(currentRaw) || 0 : 0
    const ok = current >= target

    metric_status = { name: metricName, label: stage.default_metric.label, target, current, ok }

    if (!ok && current === 0) {
      warnings.push(`${stage.default_metric.label} 还没有数据，无法判断 MVP 是否被验证`)
    } else if (!ok) {
      warnings.push(`${stage.default_metric.label} 当前 ${current}/${target}，未达目标（仍可手动推进）`)
    }
  }

  // 4. Special: stage 10 (validate_business) requires explicit outcome decision
  // (handled at advance time, not gate time — UI prompts for outcome)

  return {
    stage,
    can_advance: blockers.length === 0,
    blockers,
    warnings,
    artifacts_present: artifactCounts,
    memory_count: mc,
    metric_status,
  }
}

// ─────────────────────────────────────────────────
// Advance to a target stage (forward, backward, or pivot)
// ─────────────────────────────────────────────────
export type StageOutcome = 'succeeded' | 'failed' | 'pivoted' | 'manual'

export interface StageHistoryEntry {
  from: number
  to: number
  outcome: StageOutcome
  ts: string
  note?: string
}

export async function advanceStage(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  toStageId: number,
  outcome: StageOutcome = 'manual',
  note?: string,
): Promise<{ ok: boolean; error?: string; from?: number; to?: number }> {
  if (!getStage(toStageId)) return { ok: false, error: 'Invalid target stage' }

  const { data: project } = await supabase
    .from('projects').select('current_stage, stage_history')
    .eq('id', projectId).eq('user_id', userId).single()
  if (!project) return { ok: false, error: 'Project not found' }

  const fromStage = (project.current_stage as number) ?? 1
  if (fromStage === toStageId) return { ok: true, from: fromStage, to: toStageId }

  const history = Array.isArray(project.stage_history) ? (project.stage_history as StageHistoryEntry[]) : []
  const entry: StageHistoryEntry = {
    from: fromStage, to: toStageId, outcome,
    ts: new Date().toISOString(),
    ...(note ? { note } : {}),
  }

  const { error } = await supabase.from('projects').update({
    current_stage: toStageId,
    stage_history: [...history, entry],
  }).eq('id', projectId).eq('user_id', userId)

  if (error) return { ok: false, error: error.message }
  return { ok: true, from: fromStage, to: toStageId }
}

// ─────────────────────────────────────────────────
// Build LLM context block for a project's current stage.
// Injected into Linda's system prompt so chat is stage-aware.
// ─────────────────────────────────────────────────
export function buildStageContextForLLM(stageId: number): string {
  const stage = getStage(stageId)
  if (!stage) return ''
  return [
    '',
    '## 当前项目阶段（重要）',
    `- 阶段 ${stage.id}/${TOTAL_STAGES}：${stage.name_zh}（${stage.name_en}）`,
    `- 阶段本质：${stage.short}`,
    `- 阶段目标：${stage.goal}`,
    `- 完成标准：${stage.success_criteria}`,
    `- 推荐侧重：${stage.recommended_agents.join('、')}`,
    '',
    '请围绕当前阶段给建议——不要让用户在该深入需求时讨论技术，也不要在该写代码时讨论品牌。',
    '如果用户问的内容明显跨越多个阶段，先确认其当前最关键的瓶颈，再给针对性回答。',
    '',
  ].join('\n')
}

// ─────────────────────────────────────────────────
// Helper: determine if an agent_type is recommended for a stage
// ─────────────────────────────────────────────────
export function isAgentRecommendedForStage(agentType: string, stageId: number): boolean {
  const stage = getStage(stageId)
  if (!stage) return true
  return stage.recommended_agents.includes(agentType)
}
