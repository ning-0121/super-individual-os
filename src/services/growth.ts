import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrowthExperiment, GrowthExperimentStatus } from '@/types'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.1B — Growth service
// ─────────────────────────────────────────────────

export interface CreateGrowthExperimentInput {
  system_id: string
  project_id?: string | null
  name: string
  hypothesis?: string
  channel?: string
  target_metric?: string
  baseline_value?: string
  target_value?: string
}

export interface UpdateGrowthResultInput {
  current_value?: string
  result_summary?: string
  next_action?: string
  status?: GrowthExperimentStatus
}

// ─────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────
export async function createGrowthExperiment(
  supabase: SupabaseClient, userId: string, input: CreateGrowthExperimentInput,
): Promise<GrowthExperiment | null> {
  if (!input.system_id || !input.name?.trim()) {
    return null
  }
  const { data, error } = await supabase.from('growth_experiments').insert({
    user_id: userId,
    system_id: input.system_id,
    project_id: input.project_id ?? null,
    name: input.name.trim(),
    hypothesis: input.hypothesis ?? '',
    channel: input.channel ?? '',
    target_metric: input.target_metric ?? '',
    baseline_value: input.baseline_value ?? '',
    target_value: input.target_value ?? '',
    status: 'planning' as GrowthExperimentStatus,
  }).select().single()
  if (error || !data) {
    logger.warn('growth.create_fail', { error_message: error?.message })
    return null
  }
  return data as GrowthExperiment
}

export async function getGrowthExperiments(
  supabase: SupabaseClient, userId: string, systemId?: string,
): Promise<GrowthExperiment[]> {
  let q = supabase.from('growth_experiments').select('*')
    .eq('user_id', userId).order('updated_at', { ascending: false })
  if (systemId) q = q.eq('system_id', systemId)
  const { data } = await q
  return (data ?? []) as GrowthExperiment[]
}

export async function updateGrowthExperimentResult(
  supabase: SupabaseClient, userId: string, experimentId: string,
  result: UpdateGrowthResultInput,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (result.current_value !== undefined)  patch.current_value = result.current_value
  if (result.result_summary !== undefined) patch.result_summary = result.result_summary
  if (result.next_action !== undefined)    patch.next_action = result.next_action
  if (result.status !== undefined) {
    patch.status = result.status
    if (result.status === 'running' && !patch.started_at) patch.started_at = new Date().toISOString()
    if (result.status === 'completed' || result.status === 'aborted') {
      patch.ended_at = new Date().toISOString()
    }
  }
  const { error } = await supabase.from('growth_experiments')
    .update(patch).eq('id', experimentId).eq('user_id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─────────────────────────────────────────────────
// Pure summary helper — exposed for testing.
// Computes a weekly snapshot from raw experiment rows.
// ─────────────────────────────────────────────────
export interface WeeklyGrowthReport {
  total: number
  by_status: Record<GrowthExperimentStatus, number>
  active_channels: string[]
  next_actions: Array<{ name: string; next_action: string }>
  generated_at: string
}

export function summarizeWeeklyGrowth(exps: GrowthExperiment[]): WeeklyGrowthReport {
  const by_status: Record<GrowthExperimentStatus, number> = {
    planning: 0, running: 0, completed: 0, aborted: 0,
  }
  const channels = new Set<string>()
  const next_actions: Array<{ name: string; next_action: string }> = []

  for (const e of exps) {
    by_status[e.status] = (by_status[e.status] ?? 0) + 1
    if (e.channel) channels.add(e.channel)
    if (e.next_action && e.status !== 'completed' && e.status !== 'aborted') {
      next_actions.push({ name: e.name, next_action: e.next_action })
    }
  }
  return {
    total: exps.length,
    by_status,
    active_channels: Array.from(channels),
    next_actions: next_actions.slice(0, 5),
    generated_at: new Date().toISOString(),
  }
}

export async function generateWeeklyGrowthReport(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<WeeklyGrowthReport> {
  const exps = await getGrowthExperiments(supabase, userId, systemId)
  return summarizeWeeklyGrowth(exps)
}

// ─────────────────────────────────────────────────
// Default growth tasks — pure list, exposed for testing
// ─────────────────────────────────────────────────
export const DEFAULT_GROWTH_TASKS: ReadonlyArray<{
  name: string; channel: string; target_metric: string; hypothesis: string
}> = [
  { name: 'Market research',     channel: 'research',    target_metric: 'insights_count',
    hypothesis: 'Identify top 3 competitor patterns and 3 unmet needs.' },
  { name: 'Competitor scan',     channel: 'research',    target_metric: 'competitors_mapped',
    hypothesis: 'Map ≥5 competitors with pricing, positioning, channels.' },
  { name: 'Landing page plan',   channel: 'web',         target_metric: 'page_visits',
    hypothesis: 'A focused landing page lifts conversion vs generic site.' },
  { name: 'Outreach plan',       channel: 'cold-email',  target_metric: 'reply_rate',
    hypothesis: 'Targeted personalized outreach beats mass blast.' },
  { name: 'Content plan',        channel: 'content',     target_metric: 'engagement',
    hypothesis: 'Educational content drives organic discovery.' },
  { name: 'Feedback collection', channel: 'interviews',  target_metric: 'interviews_done',
    hypothesis: '≥10 user interviews surface 3 product gaps.' },
] as const

export async function seedGrowthTasksForSystem(
  supabase: SupabaseClient, userId: string, systemId: string,
): Promise<{ ok: boolean; created: number; error?: string }> {
  if (!systemId) return { ok: false, created: 0, error: 'systemId required' }

  const rows = DEFAULT_GROWTH_TASKS.map(t => ({
    user_id: userId,
    system_id: systemId,
    project_id: null,
    name: t.name,
    hypothesis: t.hypothesis,
    channel: t.channel,
    target_metric: t.target_metric,
    baseline_value: '',
    current_value: '',
    target_value: '',
    status: 'planning' as GrowthExperimentStatus,
  }))

  const { error } = await supabase.from('growth_experiments').insert(rows)
  if (error) return { ok: false, created: 0, error: error.message }
  return { ok: true, created: rows.length }
}
