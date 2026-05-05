import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, logger } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import { classifyRisk } from '@/lib/managers/risk-classifier'
import {
  createDefaultManagersForProject,
  createApprovalRequest,
  evaluateApprovalLevel,
} from '@/services/managers'
import { executeTaskRun } from '@/lib/ai/run-task'
import type { ManagerRole } from '@/types'

/**
 * V2.0 — Central dispatch.
 * All risky actions MUST flow through here.
 *
 * Body:
 *   {
 *     project_id: string         // required
 *     action_type: string        // 'task.run' | 'tool.github.createPullRequest' | ...
 *     action_payload?: object
 *     task_id?: string
 *     agent_type?: string
 *     tools_allowed?: string[]
 *     cost_estimate_usd?: number
 *     affects_production?: boolean
 *     risk_flags?: string[]
 *   }
 *
 * Response:
 *   200 { ok: true, dispatch: 'auto', task_run_id }                — L0/L1 auto-executed
 *   202 { ok: true, dispatch: 'pending_approval', approval_id }    — L2+ needs approval
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const body = await req.json() as {
      project_id: string
      action_type: string
      action_payload?: Record<string, unknown>
      task_id?: string
      agent_type?: string
      tools_allowed?: string[]
      cost_estimate_usd?: number
      affects_production?: boolean
      risk_flags?: string[]
    }

    if (!body.project_id || !body.action_type) {
      return apiError('project_id and action_type required', { status: 400, code: 'missing_field' })
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects').select('id').eq('id', body.project_id).eq('user_id', user.id).single()
    if (!project) return apiError('Project not found', { status: 404, code: 'project_not_found' })

    // Lazy-seed managers
    await createDefaultManagersForProject(supabase, user.id, body.project_id)

    // Classify
    const classification = classifyRisk({
      action_type: body.action_type,
      agent_type: body.agent_type,
      tools_allowed: body.tools_allowed,
      cost_estimate_usd: body.cost_estimate_usd,
      affects_production: body.affects_production,
      risk_flags: body.risk_flags,
    })

    logger.info('dispatch.classify', {
      user_id: user.id, project_id: body.project_id,
      action_type: body.action_type,
      risk_level: classification.level,
      reason: classification.reason,
    })

    // L0 / L1 — auto-execute
    if (classification.level <= 1) {
      const result = await executeAction(supabase, user.id, body)
      await audit(supabase, user.id, 'dispatch.auto', {
        resource_type: 'dispatch', resource_id: body.task_id ?? null,
        metadata: {
          project_id: body.project_id,
          action_type: body.action_type,
          risk_level: classification.level,
          result_kind: result.kind,
        },
      })
      return apiOk({ dispatch: 'auto' as const, risk_level: classification.level, ...result })
    }

    // L2 / L3 / L4 — create approval request
    const approval = await createApprovalRequest(supabase, {
      userId: user.id,
      projectId: body.project_id,
      taskId: body.task_id ?? null,
      actionType: body.action_type,
      actionPayload: body.action_payload ?? {},
      riskLevel: classification.level,
      requiredApprovers: classification.required_approvers as ManagerRole[],
      classificationReason: classification.reason,
      expiresInHours: 72,
    })

    if (!approval) return apiError('Failed to create approval request', { status: 500 })

    await audit(supabase, user.id, 'dispatch.blocked', {
      resource_type: 'approval_request', resource_id: approval.id,
      metadata: {
        project_id: body.project_id,
        action_type: body.action_type,
        risk_level: classification.level,
        required_approvers: classification.required_approvers,
        reason: classification.reason,
      },
    })

    return apiOk({
      dispatch: 'pending_approval' as const,
      approval_id: approval.id,
      risk_level: classification.level,
      required_approvers: classification.required_approvers,
      classification_reason: classification.reason,
    }, { status: 202 })

  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/dispatch', method: 'POST' })
    return apiError('Dispatch failed', { status: 500 })
  }
}

// ─────────────────────────────────────────────────
// Auto-execute action when risk allows it OR after approval
// ─────────────────────────────────────────────────
async function executeAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: { action_type: string; task_id?: string; action_payload?: Record<string, unknown> },
): Promise<{ kind: string; task_run_id?: string; detail?: unknown }> {
  if (body.action_type === 'task.run' || body.action_type.startsWith('task.run.')) {
    if (!body.task_id) throw new Error('task.run requires task_id')
    const outcome = await executeTaskRun({ supabase, userId, taskId: body.task_id })
    if ('ok' in outcome && outcome.ok) {
      return { kind: 'task_run', task_run_id: outcome.task_run_id }
    }
    if ('runtime_error' in outcome) {
      return { kind: 'task_run_error', task_run_id: outcome.task_run_id, detail: outcome.runtime_error }
    }
    if ('error' in outcome) {
      return { kind: 'gate_blocked', detail: outcome.error }
    }
    return { kind: 'unknown' }
  }
  return { kind: 'no_op', detail: 'Action type not yet supported by central dispatcher' }
}

// Re-export for /api/approval-requests/[id] resolve handler + tests
export { executeAction, evaluateApprovalLevel }
