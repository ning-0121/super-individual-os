import { createClient } from '@/lib/supabase/server'
import { runAgentTask, type ProjectContext } from '@/lib/ai/gateway'
import type { ExecutionUnit, Task } from '@/types'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: taskId } = await params

  // 1. Load task
  const { data: task, error: taskErr } = await supabase
    .from('tasks').select('*').eq('id', taskId).eq('user_id', user.id).single()
  if (taskErr || !task) {
    return Response.json({ error: 'Task not found' }, { status: 404 })
  }

  // 2. Resolve assigned agent
  const agentId = (task as Task).assigned_unit_id || (task as Task).execution_unit_id
  if (!agentId) {
    return Response.json({ error: '该任务未分配 Agent，请先指派' }, { status: 400 })
  }

  const { data: agent, error: agentErr } = await supabase
    .from('execution_units').select('*').eq('id', agentId).eq('user_id', user.id).single()
  if (agentErr || !agent) {
    return Response.json({ error: 'Agent not found' }, { status: 404 })
  }

  if ((agent as ExecutionUnit).type === 'human') {
    return Response.json({ error: 'Human-assigned tasks must be executed manually' }, { status: 400 })
  }

  if (!agent.is_active) {
    return Response.json({ error: 'Agent 已禁用，请先在 AI Workforce 启用' }, { status: 400 })
  }

  // 3. Load project context
  let projectContext: ProjectContext | null = null
  if (task.project_id) {
    const { data: project } = await supabase
      .from('projects').select('name,goal_statement,description').eq('id', task.project_id).single()
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
    task_title: task.title,
    task_description: task.description,
    expected_output: task.expected_output,
    acceptance_criteria: task.acceptance_criteria,
    task_type: task.task_type,
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

  if (runErr || !taskRun) {
    return Response.json({ error: 'Failed to create task run', detail: runErr?.message }, { status: 500 })
  }

  // 5. Update task workflow → running
  await supabase.from('tasks')
    .update({ workflow_status: 'running', status: 'in_progress' })
    .eq('id', taskId)

  // 6. Execute agent via gateway
  try {
    const result = await runAgentTask({
      agent: agent as ExecutionUnit,
      task: task as Task,
      projectContext,
    })

    // 7. Persist result
    await supabase.from('task_runs').update({
      run_status: 'completed',
      output_payload: {
        summary: result.summary,
        output: result.output,
        risks: result.risks,
        next_steps: result.next_steps,
      },
      reasoning_summary: result.reasoning_summary,
      finished_at: new Date().toISOString(),
    }).eq('id', taskRun.id)

    // 8. Move task to submitted
    await supabase.from('tasks')
      .update({ workflow_status: 'submitted' })
      .eq('id', taskId)

    // 9. Auto-create pending review
    await supabase.from('task_reviews').insert({
      task_id: taskId,
      reviewer_unit_id: null,  // user reviews
      user_id: user.id,
      review_status: 'pending',
      score: 0,
      comments: result.summary,
    })

    return Response.json({
      ok: true,
      task_run_id: taskRun.id,
      result: {
        summary: result.summary,
        output: result.output,
        reasoning_summary: result.reasoning_summary,
        risks: result.risks,
        next_steps: result.next_steps,
      },
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[runAgent] error:', errMsg)

    // Update task_run → failed
    await supabase.from('task_runs').update({
      run_status: 'failed',
      error_message: errMsg,
      finished_at: new Date().toISOString(),
    }).eq('id', taskRun.id)

    // Update task → blocked
    await supabase.from('tasks')
      .update({ workflow_status: 'blocked' })
      .eq('id', taskId)

    return Response.json({
      ok: false,
      task_run_id: taskRun.id,
      error: errMsg,
    }, { status: 500 })
  }
}
