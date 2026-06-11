import { createClient } from '@/lib/supabase/server'
import { executeTaskRun } from '@/lib/ai/run-task'
import { classifyRisk } from '@/lib/managers/risk-classifier'
import { createApprovalRequest, createDefaultManagersForProject } from '@/services/managers'
import { audit } from '@/lib/audit'
import { apiError, logger } from '@/lib/observability'
import type { ManagerRole, Task, ExecutionUnit } from '@/types'

/**
 * V2.0 — All task runs flow through risk classification first.
 * L0/L1: proceed to executeTaskRun (existing behavior).
 * L2+:   create approval_request, return 202 with approval_id.
 *
 * Existing test suite: only exercises checkRunGates directly, which is unchanged.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  const { id: taskId } = await params

  // Load task + agent for risk classification (read-only, no side effects)
  const { data: taskRow } = await supabase
    .from('tasks').select('*').eq('id', taskId).eq('user_id', user.id).single()
  if (!taskRow) return apiError('Task not found', { status: 404, code: 'task_not_found' })
  const task = taskRow as Task

  let agent: ExecutionUnit | null = null
  const agentId = task.assigned_unit_id || task.execution_unit_id
  if (agentId) {
    const { data: a } = await supabase
      .from('execution_units').select('*').eq('id', agentId).eq('user_id', user.id).single()
    agent = (a as ExecutionUnit) ?? null
  }

  // Classify
  const classification = classifyRisk({
    action_type: 'task.run',
    agent_type: agent?.agent_type,
    tools_allowed: (agent?.tools_allowed ?? []) as string[],
  })

  logger.info('task_run.classify', {
    user_id: user.id, task_id: taskId,
    risk_level: classification.level, reason: classification.reason,
    agent_type: agent?.agent_type,
  })

  // L2+ — block direct execution; require approval
  if (classification.level >= 2) {
    if (!task.project_id) {
      return apiError('Task without project_id cannot be gated; assign to a project first', { status: 400 })
    }
    await createDefaultManagersForProject(supabase, user.id, task.project_id)

    const approval = await createApprovalRequest(supabase, {
      userId: user.id,
      projectId: task.project_id,
      taskId,
      actionType: 'task.run',
      actionPayload: {
        task_id: taskId,
        agent_id: agentId,
        agent_type: agent?.agent_type,
      },
      riskLevel: classification.level,
      requiredApprovers: classification.required_approvers as ManagerRole[],
      classificationReason: classification.reason,
      expiresInHours: 72,
    })

    if (!approval) return apiError('Failed to create approval request', { status: 500 })

    await audit(supabase, user.id, 'dispatch.blocked', {
      resource_type: 'approval_request', resource_id: approval.id,
      metadata: {
        project_id: task.project_id, task_id: taskId,
        risk_level: classification.level,
        required_approvers: classification.required_approvers,
        reason: classification.reason,
      },
    })

    return Response.json({
      ok: true,
      dispatch: 'pending_approval',
      approval_id: approval.id,
      risk_level: classification.level,
      required_approvers: classification.required_approvers,
      classification_reason: classification.reason,
    }, { status: 202 })
  }

  // L0 / L1 — auto-execute (unchanged path)
  const outcome = await executeTaskRun({ supabase, userId: user.id, taskId })

  await audit(supabase, user.id, 'dispatch.auto', {
    resource_type: 'task', resource_id: taskId,
    metadata: { risk_level: classification.level, reason: classification.reason },
  })

  if ('error' in outcome) {
    const e = outcome.error
    switch (e.kind) {
      case 'task_not_found':       return apiError('Task not found', { status: 404 })
      case 'agent_not_found':      return apiError('Agent not found', { status: 404 })
      case 'no_agent':             return apiError('该任务未分配 Agent，请先指派', { status: 400 })
      case 'agent_human':          return apiError('人工任务需手动执行', { status: 400 })
      case 'agent_inactive':       return apiError('Agent 已禁用', { status: 400 })
      case 'concurrent_run':       return Response.json({
        error: `该任务已有正在运行的执行（${e.status}），请等待完成或取消`,
        existing_run_id: e.existing_run_id,
      }, { status: 409 })
      case 'dependencies_unmet':   return Response.json({
        error: '前置任务未完成，无法运行',
        blocked_by: e.blocked_by,
      }, { status: 409 })
      case 'retry_limit_reached':  return Response.json({
        error: `已达最大重试次数（${e.max_retries}）`,
        retry_count: e.retry_count,
      }, { status: 429 })
      case 'budget_exceeded':      return Response.json({
        error: e.reason,
        month_usd: e.month_usd,
        today_usd: e.today_usd,
      }, { status: 402 })
    }
  }

  if ('blocked_approval' in outcome) {
    return Response.json({
      ok: false,
      dispatch: 'pending_approval',
      task_run_id: outcome.task_run_id,
      pending_approvals: outcome.pending_approvals,
      message: '高风险工具调用已暂停，等待审批。请到 Approvals 处理。',
    }, { status: 202 })
  }

  if ('runtime_error' in outcome) {
    return Response.json({
      ok: false, task_run_id: outcome.task_run_id, error: outcome.runtime_error,
    }, { status: 500 })
  }

  return Response.json(outcome)
}
