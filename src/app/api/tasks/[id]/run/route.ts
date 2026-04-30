import { createClient } from '@/lib/supabase/server'
import { runAgentLoop, runQAEvaluation, type ProjectContext, type AgentEvaluation } from '@/lib/ai/gateway'
import { getUserConnectedTools } from '@/lib/tools/router'
import type { ExecutionUnit, Task, TaskType } from '@/types'

// Task types that automatically trigger QA review when a QA agent exists
const QA_TRIGGER_TYPES: TaskType[] = ['engineering', 'feature', 'content', 'design', 'research', 'analysis']

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: taskId } = await params

  // 1. Load task
  const { data: task, error: taskErr } = await supabase
    .from('tasks').select('*').eq('id', taskId).eq('user_id', user.id).single()
  if (taskErr || !task) return Response.json({ error: 'Task not found' }, { status: 404 })

  const t = task as Task

  // 2. Resolve assigned agent
  const agentId = t.assigned_unit_id || t.execution_unit_id
  if (!agentId) return Response.json({ error: '该任务未分配 Agent，请先指派' }, { status: 400 })

  const { data: agent, error: agentErr } = await supabase
    .from('execution_units').select('*').eq('id', agentId).eq('user_id', user.id).single()
  if (agentErr || !agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

  const a = agent as ExecutionUnit
  if (a.type === 'human') return Response.json({ error: 'Human-assigned tasks must be executed manually' }, { status: 400 })
  if (!a.is_active)        return Response.json({ error: 'Agent 已禁用，请先启用' }, { status: 400 })

  // 3. Load project context
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

  // 4. Create task_run with running status
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
      assigned_unit_id: agentId,
      user_id: user.id,
      run_status: 'running',
      input_payload: inputPayload,
      started_at: new Date().toISOString(),
    }).select().single()

  if (runErr || !taskRun) return Response.json({ error: 'Failed to create task run', detail: runErr?.message }, { status: 500 })

  // 5. Update task → running
  await supabase.from('tasks').update({ workflow_status: 'running', status: 'in_progress' }).eq('id', taskId)

  // 6. Resolve available tools
  const userConnected = await getUserConnectedTools(user.id, supabase)
  const agentAllowed  = (a.tools_allowed ?? []) as string[]
  const availableTools = agentAllowed.filter(t => userConnected.includes(t))

  // 7. Multi-step execution
  let primaryResult
  try {
    primaryResult = await runAgentLoop({
      agent: a, task: t, projectContext,
      userId: user.id, supabase, availableTools,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[runAgentLoop] error:', errMsg)
    await supabase.from('task_runs').update({
      run_status: 'failed',
      error_message: errMsg,
      finished_at: new Date().toISOString(),
    }).eq('id', taskRun.id)
    await supabase.from('tasks').update({ workflow_status: 'blocked' }).eq('id', taskId)
    return Response.json({ ok: false, task_run_id: taskRun.id, error: errMsg }, { status: 500 })
  }

  // 8. QA chain — only if applicable
  let evaluation: AgentEvaluation | null = null
  let qaAgent: ExecutionUnit | null = null

  const shouldTriggerQA =
    a.agent_type !== 'qa' &&
    !!t.task_type &&
    QA_TRIGGER_TYPES.includes(t.task_type as TaskType)

  if (shouldTriggerQA) {
    const { data: qaRow } = await supabase
      .from('execution_units').select('*')
      .eq('user_id', user.id).eq('agent_type', 'qa').eq('is_active', true)
      .maybeSingle()

    if (qaRow) {
      qaAgent = qaRow as ExecutionUnit
      try {
        evaluation = await runQAEvaluation({
          qaAgent, primaryAgent: a, task: t, primaryResult, projectContext,
        })
      } catch (e) {
        console.error('[runQAEvaluation] failed:', e instanceof Error ? e.message : e)
        evaluation = null
      }
    }
  }

  // 9. Persist final task_run
  const finalPayload = {
    summary: primaryResult.summary,
    final_output: primaryResult.final_output,
    risks: primaryResult.risks,
    next_steps: primaryResult.next_steps,
    intermediate_steps: primaryResult.intermediate_steps,
    total_steps: primaryResult.total_steps,
    evaluation,                       // null if QA didn't run
  }

  await supabase.from('task_runs').update({
    run_status: 'completed',
    output_payload: finalPayload,
    reasoning_summary: primaryResult.reasoning_summary,
    tool_calls: primaryResult.tool_calls,
    finished_at: new Date().toISOString(),
  }).eq('id', taskRun.id)

  // 10. Move task to submitted
  await supabase.from('tasks').update({ workflow_status: 'submitted' }).eq('id', taskId)

  // 11. Create review record (QA-driven if available, otherwise pending for manual review)
  if (evaluation && qaAgent) {
    const reviewStatus = evaluation.verdict === 'approved'
      ? 'approved'
      : evaluation.verdict === 'rejected'
        ? 'rejected'
        : 'revision_required'

    const reviewComments = `[${qaAgent.name} 自动评估] ${evaluation.strengths.join('；') || '(无明显优点)'}`
    const revisionInstructions = [
      ...(evaluation.issues.length ? evaluation.issues.map(i => `❌ ${i}`) : []),
      ...(evaluation.suggestions.length ? evaluation.suggestions.map(s => `💡 ${s}`) : []),
    ].join('\n')

    await supabase.from('task_reviews').insert({
      task_id: taskId,
      reviewer_unit_id: qaAgent.id,
      user_id: user.id,
      review_status: reviewStatus,
      score: evaluation.score,
      comments: reviewComments,
      revision_instructions: revisionInstructions,
    })

    // Auto-link to task workflow_status
    const taskUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (reviewStatus === 'approved') {
      taskUpdates.workflow_status = 'completed'
      taskUpdates.completed_at    = new Date().toISOString()
      taskUpdates.status          = 'done'
    } else if (reviewStatus === 'revision_required') {
      taskUpdates.workflow_status = 'revision_required'
    } else if (reviewStatus === 'rejected') {
      taskUpdates.workflow_status = 'archived'
      taskUpdates.status          = 'paused'
    }
    await supabase.from('tasks').update(taskUpdates).eq('id', taskId)

  } else {
    // No QA — create pending review for manual approval (existing behavior)
    await supabase.from('task_reviews').insert({
      task_id: taskId,
      reviewer_unit_id: null,
      user_id: user.id,
      review_status: 'pending',
      score: 0,
      comments: primaryResult.summary,
    })
  }

  return Response.json({
    ok: true,
    task_run_id: taskRun.id,
    qa_triggered: !!evaluation,
    qa_verdict: evaluation?.verdict ?? null,
    result: {
      summary: primaryResult.summary,
      final_output: primaryResult.final_output,
      total_steps: primaryResult.total_steps,
      tool_calls_count: primaryResult.tool_calls.length,
      evaluation,
    },
  })
}
