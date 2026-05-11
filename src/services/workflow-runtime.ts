import type { SupabaseClient } from '@supabase/supabase-js'
import {
  transitionStep, deriveRunStatus, type StepRunStatus,
  type Intent, type RunStatus,
} from '@/lib/workflows/state-machine'
import { findNewlyReady, detectCycle, estimateEtaMs, type StepNode } from '@/lib/workflows/dag'
import { appendActivity } from '@/services/project-context'
import { audit } from '@/lib/audit'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.8 — Workflow Runtime orchestrator
// Translates pure FSM transitions into DB updates + side effects.
// All transitions are audited; runtime is resumable (advanceRun() can
// be called any number of times — it idempotently drives the run forward).
// ─────────────────────────────────────────────────

interface WorkflowRow {
  id: string; user_id: string; project_id: string | null; name: string
}
interface WorkflowStepRow {
  id: string; workflow_id: string; step_key: string; name: string
  depends_on: string[]; step_type: string; max_attempts: number
  requires_approval: boolean; approval_role: string | null
  assigned_unit_id: string | null
}
interface WorkflowStepRunRow {
  id: string; workflow_run_id: string; workflow_step_id: string
  step_key: string; status: StepRunStatus; attempt: number; max_attempts: number
  task_id: string | null; approval_id: string | null
  next_retry_at: string | null
  result: Record<string, unknown>; error_message: string | null
}

// ─────────────────────────────────────────────────
// Start a workflow run
// ─────────────────────────────────────────────────
export async function startWorkflowRun(
  supabase: SupabaseClient, userId: string, workflowId: string,
): Promise<{ ok: boolean; run_id?: string; error?: string }> {
  const { data: workflow } = await supabase.from('workflows')
    .select('*').eq('id', workflowId).eq('user_id', userId).maybeSingle()
  if (!workflow) return { ok: false, error: 'workflow not found' }
  const wf = workflow as WorkflowRow

  const { data: stepsData } = await supabase.from('workflow_steps')
    .select('*').eq('workflow_id', workflowId).eq('user_id', userId)
    .order('sort_order', { ascending: true })
  const steps = (stepsData ?? []) as WorkflowStepRow[]
  if (steps.length === 0) return { ok: false, error: 'workflow has no steps' }

  // Validate DAG up-front — refuse cyclic
  const nodes: StepNode[] = steps.map(s => ({
    step_key: s.step_key, depends_on: (s.depends_on ?? []) as string[],
  }))
  if (detectCycle(nodes)) return { ok: false, error: 'workflow has a dependency cycle' }

  // Insert run
  const { data: run, error: runErr } = await supabase.from('workflow_runs').insert({
    user_id: userId, workflow_id: workflowId, project_id: wf.project_id,
    status: 'pending',
    started_at: new Date().toISOString(),
    eta_at: new Date(Date.now() + estimateEtaMs(steps.length)).toISOString(),
  }).select().single()
  if (runErr || !run) return { ok: false, error: runErr?.message ?? 'failed to create run' }

  // Insert step_runs in 'waiting' state
  await supabase.from('workflow_step_runs').insert(
    steps.map(s => ({
      user_id: userId, workflow_run_id: run.id, workflow_step_id: s.id,
      step_key: s.step_key, status: 'waiting' as StepRunStatus,
      attempt: 0, max_attempts: s.max_attempts ?? 3,
    })),
  )

  await audit(supabase, userId, 'workflow.run_started' as never, {
    resource_type: 'workflow_run', resource_id: run.id,
    metadata: { workflow_id: workflowId, step_count: steps.length },
  } as never)

  // Drive the first advance
  await advanceWorkflowRun(supabase, userId, run.id)
  return { ok: true, run_id: run.id }
}

// ─────────────────────────────────────────────────
// Advance — promote waiting → ready → running for any newly-eligible steps
// Idempotent: safe to call repeatedly. This is the recovery / poll entry point.
// ─────────────────────────────────────────────────
export async function advanceWorkflowRun(
  supabase: SupabaseClient, userId: string, runId: string,
): Promise<{ ok: boolean; status: RunStatus; advanced: number }> {
  const ctx = await loadRunContext(supabase, userId, runId)
  if (!ctx) return { ok: false, status: 'failed', advanced: 0 }
  const { run, steps, stepRuns } = ctx

  // Build step_key → step_row + step_run_row maps
  const stepByKey = new Map(steps.map(s => [s.step_key, s]))
  const stepRunByKey = new Map(stepRuns.map(sr => [sr.step_key, sr]))

  const nodes: StepNode[] = steps.map(s => ({ step_key: s.step_key, depends_on: s.depends_on ?? [] }))
  const slices = stepRuns.map(sr => ({ step_key: sr.step_key, status: sr.status }))

  // 1. Promote newly-ready
  const ready = findNewlyReady(nodes, slices)
  let advanced = 0
  for (const key of ready) {
    const sr = stepRunByKey.get(key)!
    const step = stepByKey.get(key)!
    const t = transitionStep(
      { status: 'waiting', step_key: key, requires_approval: step.requires_approval, approval_role: step.approval_role ?? undefined },
      { kind: 'dependencies_met' },
    )
    await applyStepTransition(supabase, userId, sr, t.next_status, t.intents, run.project_id, run.id)
    advanced++
  }

  // 2. Dispatch any 'ready' steps
  for (const sr of stepRuns) {
    const current = stepRunByKey.get(sr.step_key)!
    // Refresh from local map (we may have just updated it)
    const fresh = await refreshStepRun(supabase, userId, current.id)
    if (!fresh || fresh.status !== 'ready') continue
    const step = stepByKey.get(fresh.step_key)!
    const t = transitionStep(
      { status: 'ready', step_key: fresh.step_key, requires_approval: step.requires_approval, approval_role: step.approval_role ?? undefined },
      { kind: 'dispatch' },
    )
    await applyStepTransition(supabase, userId, fresh, t.next_status, t.intents, run.project_id, run.id)
    advanced++
  }

  // 3. Re-derive run status
  const freshRuns = await loadStepRuns(supabase, userId, runId)
  const derived = deriveRunStatus(
    freshRuns.map(sr => ({ step_key: sr.step_key, status: sr.status })),
    run.status as RunStatus,
  )
  await supabase.from('workflow_runs').update({
    status: derived.status,
    current_step_keys: derived.current_step_keys,
    completed_step_keys: derived.completed_step_keys,
    failed_step_keys: derived.failed_step_keys,
    bottleneck_step_key: derived.bottleneck_step_key,
    finished_at: derived.done ? new Date().toISOString() : null,
  }).eq('id', runId).eq('user_id', userId)

  return { ok: true, status: derived.status, advanced }
}

// ─────────────────────────────────────────────────
// Complete a step
// ─────────────────────────────────────────────────
export async function completeStepRun(
  supabase: SupabaseClient, userId: string, stepRunId: string,
  result: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  const sr = await refreshStepRun(supabase, userId, stepRunId)
  if (!sr) return { ok: false, error: 'step_run not found' }
  const t = transitionStep(
    { status: sr.status, step_key: sr.step_key },
    { kind: 'complete' },
  )
  if (!t.changed) return { ok: false, error: `cannot complete from ${sr.status}` }

  await supabase.from('workflow_step_runs').update({
    status: t.next_status, finished_at: new Date().toISOString(),
    result, updated_at: new Date().toISOString(),
  }).eq('id', stepRunId).eq('user_id', userId)

  const { data: run } = await supabase.from('workflow_runs')
    .select('project_id, id').eq('id', sr.workflow_run_id).maybeSingle()

  await runIntents(supabase, userId, t.intents, sr.step_key,
    (run as { project_id: string | null } | null)?.project_id ?? null, sr.workflow_run_id)

  await audit(supabase, userId, 'workflow.step_completed' as never, {
    resource_type: 'workflow_step_run', resource_id: stepRunId,
    metadata: { workflow_run_id: sr.workflow_run_id, step_key: sr.step_key },
  } as never)

  // Cascade: advance the run (downstream steps may now be ready)
  await advanceWorkflowRun(supabase, userId, sr.workflow_run_id)
  return { ok: true }
}

// ─────────────────────────────────────────────────
// Fail a step (with retry policy)
// ─────────────────────────────────────────────────
export async function failStepRun(
  supabase: SupabaseClient, userId: string, stepRunId: string,
  errorMessage: string,
): Promise<{ ok: boolean; retried: boolean; escalated: boolean; error?: string }> {
  const sr = await refreshStepRun(supabase, userId, stepRunId)
  if (!sr) return { ok: false, retried: false, escalated: false, error: 'step_run not found' }
  const t = transitionStep(
    { status: sr.status, step_key: sr.step_key },
    { kind: 'fail', attempt: sr.attempt, max_attempts: sr.max_attempts },
  )
  if (!t.changed) return { ok: false, retried: false, escalated: false, error: `cannot fail from ${sr.status}` }

  const retried = t.next_status === 'ready'
  const escalated = t.intents.some(i => i.kind === 'escalate_to_manager')

  // Pull the retry intent (if any) for next_retry_at
  let nextRetryAt: string | null = null
  let nextAttempt = sr.attempt
  for (const i of t.intents) {
    if (i.kind === 'schedule_retry') {
      nextRetryAt = new Date(Date.now() + i.backoff_ms).toISOString()
      nextAttempt = i.next_attempt
    }
  }

  await supabase.from('workflow_step_runs').update({
    status: t.next_status,
    attempt: nextAttempt,
    error_message: errorMessage,
    next_retry_at: nextRetryAt,
    finished_at: t.next_status === 'failed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', stepRunId).eq('user_id', userId)

  const { data: run } = await supabase.from('workflow_runs')
    .select('project_id').eq('id', sr.workflow_run_id).maybeSingle()

  await runIntents(supabase, userId, t.intents, sr.step_key,
    (run as { project_id: string | null } | null)?.project_id ?? null, sr.workflow_run_id)

  await audit(supabase, userId, 'workflow.step_failed' as never, {
    resource_type: 'workflow_step_run', resource_id: stepRunId,
    metadata: {
      workflow_run_id: sr.workflow_run_id, step_key: sr.step_key,
      attempt: nextAttempt, retried, escalated, error: errorMessage,
    },
  } as never)

  // If we escalated, also transition to 'escalated' state immediately
  if (escalated) {
    await supabase.from('workflow_step_runs').update({ status: 'escalated' })
      .eq('id', stepRunId).eq('user_id', userId)
  }

  // Re-derive run state
  await advanceWorkflowRun(supabase, userId, sr.workflow_run_id)
  return { ok: true, retried, escalated }
}

// ─────────────────────────────────────────────────
// Cancel a run
// ─────────────────────────────────────────────────
export async function cancelWorkflowRun(
  supabase: SupabaseClient, userId: string, runId: string,
): Promise<{ ok: boolean }> {
  await supabase.from('workflow_runs')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', runId).eq('user_id', userId)
  // Skip every non-terminal step run
  await supabase.from('workflow_step_runs')
    .update({ status: 'skipped', finished_at: new Date().toISOString() })
    .eq('workflow_run_id', runId).eq('user_id', userId)
    .in('status', ['waiting','ready','running','blocked_approval'])
  await audit(supabase, userId, 'workflow.run_cancelled' as never, {
    resource_type: 'workflow_run', resource_id: runId, metadata: {},
  } as never)
  return { ok: true }
}

// ─────────────────────────────────────────────────
// Approval resolution callback
// ─────────────────────────────────────────────────
export async function resolveStepApproval(
  supabase: SupabaseClient, userId: string, stepRunId: string, granted: boolean,
): Promise<{ ok: boolean }> {
  const sr = await refreshStepRun(supabase, userId, stepRunId)
  if (!sr) return { ok: false }
  const t = transitionStep(
    { status: sr.status, step_key: sr.step_key },
    { kind: granted ? 'approval_granted' : 'approval_rejected' },
  )
  if (!t.changed) return { ok: false }

  await supabase.from('workflow_step_runs').update({
    status: t.next_status, updated_at: new Date().toISOString(),
    finished_at: t.next_status === 'failed' ? new Date().toISOString() : null,
  }).eq('id', stepRunId).eq('user_id', userId)

  const { data: run } = await supabase.from('workflow_runs')
    .select('project_id').eq('id', sr.workflow_run_id).maybeSingle()
  await runIntents(supabase, userId, t.intents, sr.step_key,
    (run as { project_id: string | null } | null)?.project_id ?? null, sr.workflow_run_id)

  await audit(supabase, userId, 'workflow.step_approval_resolved' as never, {
    resource_type: 'workflow_step_run', resource_id: stepRunId,
    metadata: { granted, step_key: sr.step_key, new_status: t.next_status },
  } as never)

  await advanceWorkflowRun(supabase, userId, sr.workflow_run_id)
  return { ok: true }
}

// ─────────────────────────────────────────────────
// Internal: run side-effect intents
// ─────────────────────────────────────────────────
async function runIntents(
  supabase: SupabaseClient, userId: string, intents: Intent[],
  step_key: string, project_id: string | null, runId: string,
): Promise<void> {
  for (const i of intents) {
    try {
      switch (i.kind) {
        case 'create_task': {
          if (!project_id) break
          // Create a task tied to this workflow step (idempotent on step_run_id metadata)
          await supabase.from('tasks').insert({
            user_id: userId,
            project_id,
            title: `[wf] ${step_key}`,
            description: 'Auto-created by Workflow Runtime',
            priority: 'important',
            workflow_status: 'planned',
            status: 'todo',
          })
          break
        }
        case 'create_approval': {
          if (!project_id) break
          await supabase.from('approval_requests').insert({
            user_id: userId,
            project_id,
            action_type: 'workflow.step.gate',
            action_payload: { step_key, workflow_run_id: runId },
            title: `Workflow gate: ${step_key}`,
            risk_level: 3,
            risk_label: 'high',
            requested_by: 'workflow_runtime',
            required_approvers: i.role ? [i.role] : ['ceo'],
            classification_reason: 'Workflow approval gate',
            status: 'pending',
          })
          break
        }
        case 'escalate_to_manager': {
          if (!project_id) break
          // Generate a risk-flavored manager_report stub
          await supabase.from('manager_reports').insert({
            user_id: userId, project_id,
            role: 'engineering_manager',
            report_period: 'on_demand',
            report_type: 'risk',
            title: `Workflow step escalation: ${step_key}`,
            summary: i.reason,
            blockers: [i.reason],
            risks: ['Workflow stalled — manual intervention needed'],
            next_actions: ['Review failed step, decide retry / pivot / cancel'],
            needs_user_intervention: true,
            source: 'rule_based',
            confidence_score: 0.6,
          })
          break
        }
        case 'append_activity': {
          if (!project_id) break
          await appendActivity(supabase, userId, project_id, {
            activity_type: 'workflow_update',
            title: i.title,
            metadata: { step_key, workflow_run_id: runId, ...(i.metadata ?? {}) },
          })
          break
        }
        case 'dispatch_unit':
        case 'schedule_retry':
        case 'mark_run_status':
          // V1: these are recorded via the FSM but executed in the calling
          // function (e.g. failStepRun handles next_retry_at). No-op here.
          break
      }
    } catch (e) {
      logger.warn('workflow.intent_fail', {
        intent: i.kind, error_message: (e as Error).message,
      })
    }
  }
}

// ─────────────────────────────────────────────────
// Internal: persist a step transition
// ─────────────────────────────────────────────────
async function applyStepTransition(
  supabase: SupabaseClient, userId: string,
  sr: WorkflowStepRunRow, nextStatus: StepRunStatus,
  intents: Intent[], project_id: string | null, runId: string,
): Promise<void> {
  await supabase.from('workflow_step_runs').update({
    status: nextStatus,
    started_at: nextStatus === 'running' && !sr.next_retry_at ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', sr.id).eq('user_id', userId)
  await runIntents(supabase, userId, intents, sr.step_key, project_id, runId)
}

// ─────────────────────────────────────────────────
// Internal: loaders
// ─────────────────────────────────────────────────
async function loadRunContext(supabase: SupabaseClient, userId: string, runId: string) {
  const { data: run } = await supabase.from('workflow_runs')
    .select('*').eq('id', runId).eq('user_id', userId).maybeSingle()
  if (!run) return null
  const { data: steps } = await supabase.from('workflow_steps')
    .select('*').eq('workflow_id', run.workflow_id).eq('user_id', userId)
  const stepRuns = await loadStepRuns(supabase, userId, runId)
  return {
    run: run as WorkflowRow & { status: RunStatus; workflow_id: string },
    steps: (steps ?? []) as WorkflowStepRow[],
    stepRuns,
  }
}

async function loadStepRuns(supabase: SupabaseClient, userId: string, runId: string)
  : Promise<WorkflowStepRunRow[]>
{
  const { data } = await supabase.from('workflow_step_runs')
    .select('*').eq('workflow_run_id', runId).eq('user_id', userId)
  return (data ?? []) as WorkflowStepRunRow[]
}

async function refreshStepRun(supabase: SupabaseClient, userId: string, stepRunId: string)
  : Promise<WorkflowStepRunRow | null>
{
  const { data } = await supabase.from('workflow_step_runs')
    .select('*').eq('id', stepRunId).eq('user_id', userId).maybeSingle()
  return data as WorkflowStepRunRow | null
}

// ─────────────────────────────────────────────────
// Active runs (for Mission Control widget)
// ─────────────────────────────────────────────────
export interface ActiveWorkflowRow {
  run_id: string
  workflow_id: string
  workflow_name: string
  project_id: string | null
  project_name: string | null
  status: RunStatus
  bottleneck_step_key: string | null
  current_step_keys: string[]
  completed: number
  total: number
  failed: number
  eta_at: string | null
  started_at: string
  owner: string | null
}

export async function listActiveWorkflowRuns(
  supabase: SupabaseClient, userId: string, limit = 10,
): Promise<ActiveWorkflowRow[]> {
  const { data: runs } = await supabase.from('workflow_runs')
    .select('id, workflow_id, project_id, status, bottleneck_step_key, current_step_keys, completed_step_keys, failed_step_keys, eta_at, started_at, owner_unit_id')
    .eq('user_id', userId)
    .in('status', ['running','blocked_approval','pending'])
    .order('started_at', { ascending: false }).limit(limit)
  if (!runs || runs.length === 0) return []

  const wfIds = [...new Set(runs.map(r => r.workflow_id as string))]
  const projectIds = [...new Set(runs.map(r => r.project_id as string | null).filter(Boolean) as string[])]
  const ownerIds = [...new Set(runs.map(r => r.owner_unit_id as string | null).filter(Boolean) as string[])]

  const [
    { data: wfs },
    { data: projects },
    { data: units },
  ] = await Promise.all([
    supabase.from('workflows').select('id, name').in('id', wfIds),
    projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
    ownerIds.length ? supabase.from('execution_units').select('id, name, avatar').in('id', ownerIds) : Promise.resolve({ data: [] }),
  ])

  const wfMap = new Map((wfs ?? []).map(w => [w.id as string, w.name as string]))
  const projMap = new Map((projects ?? []).map(p => [p.id as string, p.name as string]))
  const ownerMap = new Map(
    ((units ?? []) as Array<{ id: string; name: string; avatar: string }>)
      .map(u => [u.id, `${u.avatar ?? '🤖'} ${u.name}`]),
  )

  // For total step count, batch-load
  const stepCounts = new Map<string, number>()
  if (wfIds.length > 0) {
    const { data: stepCountData } = await supabase.from('workflow_steps')
      .select('workflow_id').in('workflow_id', wfIds)
    for (const s of (stepCountData ?? [])) {
      const wid = s.workflow_id as string
      stepCounts.set(wid, (stepCounts.get(wid) ?? 0) + 1)
    }
  }

  return runs.map(r => ({
    run_id: r.id as string,
    workflow_id: r.workflow_id as string,
    workflow_name: wfMap.get(r.workflow_id as string) ?? '(workflow)',
    project_id: (r.project_id as string | null) ?? null,
    project_name: r.project_id ? projMap.get(r.project_id as string) ?? null : null,
    status: r.status as RunStatus,
    bottleneck_step_key: (r.bottleneck_step_key as string | null) ?? null,
    current_step_keys: (r.current_step_keys ?? []) as string[],
    completed: ((r.completed_step_keys ?? []) as string[]).length,
    total: stepCounts.get(r.workflow_id as string) ?? 0,
    failed: ((r.failed_step_keys ?? []) as string[]).length,
    eta_at: (r.eta_at as string | null) ?? null,
    started_at: r.started_at as string,
    owner: r.owner_unit_id ? ownerMap.get(r.owner_unit_id as string) ?? null : null,
  }))
}
