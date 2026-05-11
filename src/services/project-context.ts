import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectContext, ProjectActivityLog, ProjectActivityType } from '@/types'
import {
  buildProjectPromptBlock, summarizeForHandoff, mergeActivityIntoContext,
  type ActivityEvent, type HandoffSummary,
} from '@/lib/project-context'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.5 — Project Context service (DB orchestration)
// ─────────────────────────────────────────────────

// Get the project_context row, creating a default if missing.
export async function getOrCreateContext(
  supabase: SupabaseClient, userId: string, projectId: string,
): Promise<ProjectContext | null> {
  const { data: existing } = await supabase.from('project_contexts')
    .select('*').eq('user_id', userId).eq('project_id', projectId).maybeSingle()
  if (existing) return existing as ProjectContext

  // Seed from the parent project row when possible
  const { data: project } = await supabase.from('projects')
    .select('name, goal_statement, north_star_metric, monthly_focus, current_stage')
    .eq('id', projectId).eq('user_id', userId).maybeSingle()

  const seed = {
    user_id: userId,
    project_id: projectId,
    project_goal: (project?.goal_statement as string) ?? '',
    current_stage: (project?.current_stage !== undefined && project?.current_stage !== null)
      ? `stage ${project.current_stage}` : '',
    current_focus: (project?.monthly_focus as string) ?? '',
    context_version: 1,
    locked: false,
  }

  const { data, error } = await supabase.from('project_contexts')
    .insert(seed).select().single()
  if (error || !data) {
    logger.warn('project_context.create_fail', { error_message: error?.message })
    return null
  }
  return data as ProjectContext
}

// Patch the context — any field may be supplied; updated_at bumps automatically.
export async function updateContext(
  supabase: SupabaseClient, userId: string, projectId: string,
  patch: Partial<ProjectContext>,
): Promise<ProjectContext | null> {
  const { data, error } = await supabase.from('project_contexts').update({
    ...patch, updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('project_id', projectId).select().single()
  if (error || !data) return null
  return data as ProjectContext
}

// Lock / unlock the context. While locked, AI surfaces must inject it.
export async function setContextLock(
  supabase: SupabaseClient, userId: string, projectId: string, locked: boolean,
): Promise<ProjectContext | null> {
  // Ensure row exists
  await getOrCreateContext(supabase, userId, projectId)
  const patch: Record<string, unknown> = {
    locked,
    locked_at: locked ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  const { data } = await supabase.from('project_contexts')
    .update(patch).eq('user_id', userId).eq('project_id', projectId).select().single()
  return (data ?? null) as ProjectContext | null
}

// Append to project_activity_logs AND merge into the context (bump version).
// This is the single canonical write path. Callers from approval-resolve,
// task-complete, manager-report-generate, etc. should funnel through here.
export async function appendActivity(
  supabase: SupabaseClient, userId: string, projectId: string,
  event: ActivityEvent,
): Promise<{ activity: ProjectActivityLog | null; context: ProjectContext | null }> {
  // Insert activity log
  const { data: activity } = await supabase.from('project_activity_logs').insert({
    user_id: userId, project_id: projectId,
    activity_type: event.activity_type,
    title: event.title,
    summary: event.summary ?? '',
    metadata: event.metadata ?? {},
  }).select().single()

  // Merge into context
  const ctx = await getOrCreateContext(supabase, userId, projectId)
  if (!ctx) return { activity: (activity ?? null) as ProjectActivityLog | null, context: null }

  const patch = mergeActivityIntoContext(ctx, event)
  const nextCtx = await updateContext(supabase, userId, projectId, patch)
  return {
    activity: (activity ?? null) as ProjectActivityLog | null,
    context: nextCtx,
  }
}

export async function getRecentActivity(
  supabase: SupabaseClient, userId: string, projectId: string, limit = 20,
): Promise<ProjectActivityLog[]> {
  const { data } = await supabase.from('project_activity_logs')
    .select('*').eq('user_id', userId).eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(limit)
  return (data ?? []) as ProjectActivityLog[]
}

export async function generateHandoff(
  supabase: SupabaseClient, userId: string, projectId: string,
): Promise<HandoffSummary | null> {
  const ctx = await getOrCreateContext(supabase, userId, projectId)
  if (!ctx) return null
  const { data: project } = await supabase.from('projects')
    .select('name').eq('id', projectId).eq('user_id', userId).maybeSingle()
  const projectName = (project?.name as string) ?? 'Untitled Project'
  const recent = await getRecentActivity(supabase, userId, projectId, 10)
  const summary = summarizeForHandoff({ project_name: projectName, ctx, recent_activity: recent })

  // Persist the summary as last_ai_summary + bump version
  await appendActivity(supabase, userId, projectId, {
    activity_type: 'ai_summary',
    title: 'Handoff summary generated',
    summary: summary.text,
  })

  return summary
}

// Build the LLM prompt block — used by chat / dispatch / manager loops
// when a project_id is present.
export async function buildPromptBlockForProject(
  supabase: SupabaseClient, userId: string, projectId: string,
): Promise<string | null> {
  const ctx = await getOrCreateContext(supabase, userId, projectId)
  if (!ctx) return null
  const { data: project } = await supabase.from('projects')
    .select('name').eq('id', projectId).eq('user_id', userId).maybeSingle()
  return buildProjectPromptBlock(ctx, {
    project_name: (project?.name as string) ?? undefined,
  })
}

// Convenience re-exports
export type { ActivityEvent, ProjectActivityType }
