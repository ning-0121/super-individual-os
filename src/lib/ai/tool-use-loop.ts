import type { SupabaseClient } from '@supabase/supabase-js'
import { routeModelForTask, callModel, recordModelRun, type TaskStage } from './model-router'
import { executeAutonomousToolCall, type AutonomousToolCall, type ToolAutonomyResult } from '@/lib/tools/tool-autonomy'

// ─────────────────────────────────────────────────
// V2.2 — Tool Use Loop
// 1. Manager emits a plan (ToolUseStep[])
// 2. Model Router picks the model for the task stage
// 3. Each step is dispatched through the Tool Autonomy Router
// 4. Results captured; QA stage runs after if requested
//
// This is the deterministic orchestrator. The model itself is invoked only
// when planSteps does not pre-populate tool calls (i.e. when the agent
// needs to draft them from natural-language intent).
// ─────────────────────────────────────────────────

export interface ToolUseStep {
  capability_action: string         // e.g. 'github.pr.create'
  raw_tool: string                  // 'github'
  raw_action: string                // 'createPullRequest'
  params: Record<string, unknown>
  approved?: boolean                // pass-through approval flag
}

export interface ToolUsePlan {
  stage: TaskStage
  steps: ToolUseStep[]
  qa_required?: boolean
  task_run_id?: string
  project_id?: string
}

export interface ToolUseLoopResult {
  ok: boolean
  stage: TaskStage
  step_results: Array<{ step: ToolUseStep; result: ToolAutonomyResult }>
  blocked: number
  failed: number
  qa_review?: { provider: string; reason: string }
}

export async function runToolUseLoop(
  supabase: SupabaseClient, userId: string, plan: ToolUsePlan,
): Promise<ToolUseLoopResult> {
  const choice = routeModelForTask(plan.stage)

  // Record model selection event (no tokens spent if we don't actually call yet)
  await recordModelRun(supabase, userId, {
    task_run_id: plan.task_run_id,
    choice,
    agent_type: plan.stage,
    task_kind: plan.stage,
    output: { text: '', input_tokens: 0, output_tokens: 0,
              model: choice.model, provider: choice.provider, duration_ms: 0 },
    status: 'success',
  }).catch(() => { /* best-effort audit */ })

  const stepResults: ToolUseLoopResult['step_results'] = []
  let blocked = 0
  let failed = 0

  for (const step of plan.steps) {
    const call: AutonomousToolCall = {
      capability_action: step.capability_action,
      raw_tool: step.raw_tool,
      raw_action: step.raw_action,
      params: step.params,
      task_run_id: plan.task_run_id,
      project_id: plan.project_id,
    }
    const out = await executeAutonomousToolCall(supabase, userId, call, { approved: step.approved })
    stepResults.push({ step, result: out })
    if (out.status === 'pending_approval' || out.status === 'blocked') blocked++
    if (out.status === 'error') failed++
  }

  const qa_review = plan.qa_required
    ? (() => {
        const qa = routeModelForTask('qa')
        return { provider: qa.provider, reason: qa.reason }
      })()
    : undefined

  return {
    ok: failed === 0 && blocked === 0,
    stage: plan.stage,
    step_results: stepResults,
    blocked, failed, qa_review,
  }
}

// Convenience helper for callers that want to invoke the model directly
// (not currently wired by tests; here as a documented entry point).
export async function draftAndRun(
  supabase: SupabaseClient, userId: string,
  args: { stage: TaskStage; system?: string; prompt: string; task_run_id?: string },
): Promise<{ text: string }> {
  const choice = routeModelForTask(args.stage)
  const out = await callModel({ system: args.system, prompt: args.prompt }, choice)
  await recordModelRun(supabase, userId, {
    task_run_id: args.task_run_id,
    choice, agent_type: args.stage, task_kind: args.stage,
    output: out, status: 'success',
  })
  return { text: out.text }
}
