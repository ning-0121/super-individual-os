import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgentLoop, runQAEvaluation, type ProjectContext, type AgentEvaluation } from '@/lib/ai/gateway'
import { getUserConnectedTools } from '@/lib/tools/router'
import { extractAndSaveArtifacts } from '@/lib/ai/artifact-extractor'
import { logger } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import { assertBudgetAllowed } from '@/services/cost-budget'
import type { ExecutionUnit, Task, TaskType } from '@/types'

const QA_TRIGGER_TYPES: TaskType[] = ['engineering', 'feature', 'content', 'design', 'research', 'analysis']
const DEFAULT_MAX_RETRIES = 3

export type RunGuardError =
  | { kind: 'task_not_found' }
  | { kind: 'agent_not_found' }
  | { kind: 'agent_human' }
  | { kind: 'agent_inactive' }
  | { kind: 'no_agent' }
  | { kind: 'concurrent_run'; existing_run_id: string; status: string }
  | { kind: 'dependencies_unmet'; blocked_by: Array<{ id: string; title: string; status: string }> }
  | { kind: 'retry_limit_reached'; retry_count: number; max_retries: number }
  | { kind: 'budget_exceeded'; reason: string; month_usd: number; today_usd: number }

export type RunOutcome =
  | { ok: true; task_run_id: string; qa_triggered: boolean; qa_verdict: string | null; artifact_count: number; total_steps: number }
  | { ok: false; error: RunGuardError }
  | { ok: false; runtime_error: string; task_run_id: string }

// ─────────────────────────────────────────────────
// Pre-flight gates
// ─────────────────────────────────────────────────
export async function checkRunGates(supabase: SupabaseClient, userId: string, taskId: string): Promise<{
  pass: true; task: Task; agent: ExecutionUnit; projectContext: ProjectContext | null
} | { pass: false; error: RunGuardError }> {

  // 1. Load task
  const { data: task } = await supabase
    .from('tasks').select('*').eq('id', taskId).eq('user_id', userId).single()
  if (!task) return { pass: false, error: { kind: 'task_not_found' } }
  const t = task as Task

  // 2. Resolve agent
  const agentId = t.assigned_unit_id || t.execution_unit_id
  if (!agentId) return { pass: false, error: { kind: 'no_agent' } }

  const { data: agent } = await supabase
    .from('execution_units').select('*').eq('id', agentId).eq('user_id', userId).single()
  if (!agent) return { pass: false, error: { kind: 'agent_not_found' } }

  const a = agent as ExecutionUnit
  if (a.type === 'human') return { pass: false, error: { kind: 'agent_human' } }
  if (!a.is_active)        return { pass: false, error: { kind: 'agent_inactive' } }

  // 3. Run lock — no concurrent run for same task
  const { data: active } = await supabase
    .from('task_runs')
    .select('id, run_status')
    .eq('task_id', taskId)
    .in('run_status', ['queued', 'running'])
    .limit(1)
  if (active && active.length > 0) {
    return { pass: false, error: { kind: 'concurrent_run', existing_run_id: active[0].id, status: active[0].run_status } }
  }

  // 4. Dependency gate
  const cp = (t.context_payload ?? {}) as { depends_on?: unknown }
  const depIds = Array.isArray(cp.depends_on) ? (cp.depends_on as unknown[]).filter(x => typeof x === 'string') as string[] : []
  if (depIds.length > 0) {
    const { data: deps } = await supabase
      .from('tasks')
      .select('id, title, workflow_status')
      .in('id', depIds)
    const blocked = (deps ?? [])
      .filter(d => !['completed', 'approved'].includes(String(d.workflow_status ?? '')))
      .map(d => ({ id: d.id as string, title: d.title as string, status: String(d.workflow_status ?? 'unknown') }))
    if (blocked.length > 0) {
      return { pass: false, error: { kind: 'dependencies_unmet', blocked_by: blocked } }
    }
  }

  // 5. Project context
  let projectContext: ProjectContext | null = null
  if (t.project_id) {
    const { data: project } = await supabase
      .from('projects').select('name,goal_statement,description').eq('id', t.project_id).single()
    if (project) {
      projectContext = {
        name: project.name,
        goal: project.goal_statement || '',
        description: project.description || '',
      }
    }
  }

  return { pass: true, task: t, agent: a, projectContext }
}

// ─────────────────────────────────────────────────
// Execute a task run (called from /run and /retry)
// ─────────────────────────────────────────────────
export async function executeTaskRun(params: {
  supabase: SupabaseClient
  userId: string
  taskId: string
  parentRunId?: string | null
  retryCount?: number
}): Promise<RunOutcome> {
  const { supabase, userId, taskId, parentRunId = null, retryCount = 0 } = params

  // Pre-flight
  const gate = await checkRunGates(supabase, userId, taskId)
  if (!gate.pass) return { ok: false, error: gate.error }

  const { task: t, agent: a, projectContext } = gate

  // Retry-limit check
  if (retryCount >= DEFAULT_MAX_RETRIES) {
    return { ok: false, error: { kind: 'retry_limit_reached', retry_count: retryCount, max_retries: DEFAULT_MAX_RETRIES } }
  }

  // ── Cost hard-cap gate ──────────────────────────────────────────────
  // This is the real token spender (multi-step LLM + tool loop). Block BEFORE
  // creating any task_run so a rejected run leaves zero dirty state. Plain
  // chat (/api/ai/strategy) does not pass through here and is unaffected.
  const budget = await assertBudgetAllowed(supabase, userId)
  if (budget.blocked) {
    await audit(supabase, userId, 'task_run.failed', {
      resource_type: 'task', resource_id: taskId,
      metadata: {
        rejected: 'budget_exceeded',
        reason: budget.reason ?? 'cost hard cap',
        month_usd: budget.status.month_usd,
        today_usd: budget.status.today_usd,
        agent_id: a.id,
      },
    })
    logger.warn('run.blocked_budget', {
      user_id: userId, task_id: taskId,
      month_usd: budget.status.month_usd, today_usd: budget.status.today_usd,
    })
    return {
      ok: false,
      error: {
        kind: 'budget_exceeded',
        reason: budget.reason ?? '成本已触顶，本次执行被硬上限拦截',
        month_usd: budget.status.month_usd,
        today_usd: budget.status.today_usd,
      },
    }
  }

  // Create task_run
  const inputPayload = {
    task_title: t.title,
    task_description: t.description,
    expected_output: t.expected_output,
    acceptance_criteria: t.acceptance_criteria,
    task_type: t.task_type,
    project_context: projectContext,
  }

  const { data: taskRun, error: runErr } = await supabase
    .from('task_runs').insert({
      task_id: taskId,
      assigned_unit_id: a.id,
      user_id: userId,
      run_status: 'running',
      input_payload: inputPayload,
      retry_count: retryCount,
      max_retries: DEFAULT_MAX_RETRIES,
      parent_run_id: parentRunId,
      started_at: new Date().toISOString(),
    }).select().single()

  if (runErr || !taskRun) {
    return { ok: false, runtime_error: runErr?.message ?? 'Failed to create task_run', task_run_id: '' }
  }

  // Update task → running
  await supabase.from('tasks').update({ workflow_status: 'running', status: 'in_progress' }).eq('id', taskId)

  // Resolve tools
  const userConnected = await getUserConnectedTools(userId, supabase)
  const agentAllowed  = (a.tools_allowed ?? []) as string[]
  const availableTools = agentAllowed.filter(tool => userConnected.includes(tool))

  // Run multi-step loop
  const runStart = Date.now()
  logger.info('run.start', { user_id: userId, task_id: taskId, task_run_id: taskRun.id, agent_id: a.id, agent_name: a.name, retry_count: retryCount })
  await audit(supabase, userId, retryCount > 0 ? 'task_run.retry' : 'task_run.start', {
    resource_type: 'task_run', resource_id: taskRun.id,
    metadata: { task_id: taskId, agent_id: a.id, agent_name: a.name, retry_count: retryCount },
  })

  let primaryResult
  try {
    primaryResult = await runAgentLoop({
      agent: a, task: t, projectContext,
      userId, supabase, availableTools,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    reportError(e, {
      user_id: userId, task_id: taskId, task_run_id: taskRun.id, agent_id: a.id,
    })
    logger.error('run.fail', {
      user_id: userId, task_id: taskId, task_run_id: taskRun.id, agent_id: a.id,
      duration_ms: Date.now() - runStart, retry_count: retryCount,
      error_message: errMsg,
    })
    await audit(supabase, userId, 'task_run.failed', {
      resource_type: 'task_run', resource_id: taskRun.id,
      metadata: { error_message: errMsg, retry_count: retryCount, duration_ms: Date.now() - runStart },
    })

    await supabase.from('task_runs').update({
      run_status: 'failed',
      error_message: errMsg,
      error_context: {
        kind: 'gateway_error',
        message: errMsg,
        agent_id: a.id,
        agent_name: a.name,
        retry_count: retryCount,
        execution_duration_ms: Date.now() - runStart,
        timestamp: new Date().toISOString(),
      },
      finished_at: new Date().toISOString(),
    }).eq('id', taskRun.id)

    await supabase.from('tasks').update({ workflow_status: 'blocked' }).eq('id', taskId)
    return { ok: false, runtime_error: errMsg, task_run_id: taskRun.id }
  }

  // Re-check status (handles cancel race)
  const { data: stillRunning } = await supabase
    .from('task_runs').select('run_status').eq('id', taskRun.id).single()
  if (stillRunning?.run_status === 'cancelled') {
    return { ok: true, task_run_id: taskRun.id, qa_triggered: false, qa_verdict: null, artifact_count: 0, total_steps: primaryResult.total_steps }
  }

  // QA chain (V1.3)
  let evaluation: AgentEvaluation | null = null
  let qaAgent: ExecutionUnit | null = null

  const shouldQA = a.agent_type !== 'qa' && !!t.task_type && QA_TRIGGER_TYPES.includes(t.task_type as TaskType)
  if (shouldQA) {
    const { data: qaRow } = await supabase
      .from('execution_units').select('*')
      .eq('user_id', userId).eq('agent_type', 'qa').eq('is_active', true).maybeSingle()
    if (qaRow) {
      qaAgent = qaRow as ExecutionUnit
      try {
        evaluation = await runQAEvaluation({ qaAgent, primaryAgent: a, task: t, primaryResult, projectContext })
      } catch (e) {
        console.error('[runQAEvaluation] failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  // Compute observability metrics
  const execution_duration_ms = Date.now() - runStart
  const tool_error_count = primaryResult.tool_calls.filter(t => t.status === 'error').length
  const tool_success_count = primaryResult.tool_calls.filter(t => t.status === 'success').length

  // Persist final task_run
  const finalPayload = {
    summary: primaryResult.summary,
    final_output: primaryResult.final_output,
    risks: primaryResult.risks,
    next_steps: primaryResult.next_steps,
    intermediate_steps: primaryResult.intermediate_steps,
    total_steps: primaryResult.total_steps,
    evaluation,
    // V1.5 observability
    execution_duration_ms,
    tool_error_count,
    tool_success_count,
  }

  logger.info('run.ok', {
    user_id: userId, task_id: taskId, task_run_id: taskRun.id, agent_id: a.id, agent_name: a.name,
    duration_ms: execution_duration_ms,
    total_steps: primaryResult.total_steps,
    tool_success_count, tool_error_count,
    qa_verdict: evaluation?.verdict ?? null,
  })
  await audit(supabase, userId, 'task_run.succeeded', {
    resource_type: 'task_run', resource_id: taskRun.id,
    metadata: {
      duration_ms: execution_duration_ms,
      total_steps: primaryResult.total_steps,
      tool_success_count, tool_error_count,
      qa_verdict: evaluation?.verdict ?? null,
    },
  })

  await supabase.from('task_runs').update({
    run_status: 'succeeded',
    output_payload: finalPayload,
    reasoning_summary: primaryResult.reasoning_summary,
    tool_calls: primaryResult.tool_calls,
    finished_at: new Date().toISOString(),
  }).eq('id', taskRun.id)

  // Move task → submitted
  await supabase.from('tasks').update({ workflow_status: 'submitted' }).eq('id', taskId)

  // Create review (QA-driven or pending)
  if (evaluation && qaAgent) {
    const reviewStatus = evaluation.verdict === 'approved' ? 'approved'
      : evaluation.verdict === 'rejected' ? 'rejected' : 'revision_required'

    await supabase.from('task_reviews').insert({
      task_id: taskId,
      reviewer_unit_id: qaAgent.id,
      user_id: userId,
      review_status: reviewStatus,
      score: evaluation.score,
      comments: `[${qaAgent.name} 自动评估] ${evaluation.strengths.join('；') || '(无明显优点)'}`,
      revision_instructions: [
        ...evaluation.issues.map(i => `❌ ${i}`),
        ...evaluation.suggestions.map(s => `💡 ${s}`),
      ].join('\n'),
    })

    const taskUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (reviewStatus === 'approved') {
      taskUpdates.workflow_status = 'completed'
      taskUpdates.completed_at = new Date().toISOString()
      taskUpdates.status = 'done'
    } else if (reviewStatus === 'revision_required') {
      taskUpdates.workflow_status = 'revision_required'
    } else if (reviewStatus === 'rejected') {
      taskUpdates.workflow_status = 'archived'
      taskUpdates.status = 'paused'
    }
    await supabase.from('tasks').update(taskUpdates).eq('id', taskId)
  } else {
    await supabase.from('task_reviews').insert({
      task_id: taskId,
      reviewer_unit_id: null,
      user_id: userId,
      review_status: 'pending',
      score: 0,
      comments: primaryResult.summary,
    })
  }

  // Extract artifacts
  let artifactCount = 0
  try {
    artifactCount = await extractAndSaveArtifacts({
      supabase,
      userId,
      taskRunId: taskRun.id,
      taskId,
      projectId: t.project_id,
      agent: a,
      finalOutput: primaryResult.final_output,
      summary: primaryResult.summary,
      toolCalls: primaryResult.tool_calls,
    })
  } catch (e) {
    console.error('[artifactExtractor] failed:', e instanceof Error ? e.message : e)
  }

  return {
    ok: true,
    task_run_id: taskRun.id,
    qa_triggered: !!evaluation,
    qa_verdict: evaluation?.verdict ?? null,
    artifact_count: artifactCount,
    total_steps: primaryResult.total_steps,
  }
}
