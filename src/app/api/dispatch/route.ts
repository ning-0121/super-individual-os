import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk, logger } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import { classifyRisk } from '@/lib/managers/risk-classifier'
import { evaluateForDispatch } from '@/services/policies'
import { aiManagersUnanimous, type DecisionContext } from '@/lib/managers/ai-manager'
import { autoDecideApprovalRequest } from '@/services/manager-auto-decision'
import {
  createDefaultManagersForProject,
  createApprovalRequest,
  evaluateApprovalLevel,
} from '@/services/managers'
import { executeTaskRun } from '@/lib/ai/run-task'
import { getStage } from '@/lib/stages/definitions'
import type { ManagerRole } from '@/types'

/**
 * V2.1 — Central dispatch with policy + AI manager auto-approval.
 *
 * Pipeline:
 *   1. classify risk
 *   2. evaluate execution_policies → decision
 *   3. branch:
 *      auto_approve   → execute + audit
 *      ai_manager     → ask AI manager(s); unanimous approve → execute, else escalate
 *      human_required → create approval_request (Phase 2A path)
 *      block          → reject outright
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

    const { data: project } = await supabase
      .from('projects').select('id, name, goal_statement, current_stage')
      .eq('id', body.project_id).eq('user_id', user.id).single()
    if (!project) return apiError('Project not found', { status: 404 })

    await createDefaultManagersForProject(supabase, user.id, body.project_id)

    // 1. Risk classification
    const classification = classifyRisk({
      action_type: body.action_type,
      agent_type: body.agent_type,
      tools_allowed: body.tools_allowed,
      cost_estimate_usd: body.cost_estimate_usd,
      affects_production: body.affects_production,
      risk_flags: body.risk_flags,
    })

    // 2. Policy evaluation
    const policy = await evaluateForDispatch(supabase, user.id, body.project_id, {
      action_type: body.action_type,
      risk_level: classification.level,
      agent_type: body.agent_type,
      tools_allowed: body.tools_allowed,
      cost_estimate_usd: body.cost_estimate_usd,
      risk_flags: body.risk_flags,
    })

    await audit(supabase, user.id, 'policy.matched', {
      resource_type: 'dispatch',
      metadata: {
        project_id: body.project_id,
        action_type: body.action_type,
        risk_level: classification.level,
        policy_decision: policy.decision,
        policy_name: policy.matched_policy_name,
        policy_id: policy.matched_policy_id,
      },
    })

    logger.info('dispatch.policy', {
      user_id: user.id, project_id: body.project_id,
      action_type: body.action_type, risk_level: classification.level,
      policy_decision: policy.decision, policy_name: policy.matched_policy_name,
    })

    // 3. Branch
    switch (policy.decision) {

      case 'auto_approve': {
        const result = await executeAction(supabase, user.id, body)
        await audit(supabase, user.id, 'auto_approval.granted', {
          resource_type: 'dispatch', resource_id: body.task_id ?? null,
          metadata: {
            project_id: body.project_id, action_type: body.action_type,
            risk_level: classification.level,
            policy_name: policy.matched_policy_name,
            result_kind: result.kind, source: 'policy',
          },
        })
        return apiOk({
          dispatch: 'auto', source: 'policy',
          policy_name: policy.matched_policy_name,
          risk_level: classification.level,
          ...result,
        })
      }

      case 'ai_manager': {
        // V2.1+ — prefer roles_required (multi-approver), fall back to single role,
        // fall back to risk classifier.
        const roles: ManagerRole[] = (policy.ai_manager_roles_required && policy.ai_manager_roles_required.length > 0)
          ? policy.ai_manager_roles_required
          : policy.ai_manager_role
            ? [policy.ai_manager_role]
            : (classification.required_approvers as ManagerRole[])

        const stage = (project.current_stage as number | null) ?? null
        const stageDef = stage ? getStage(stage) : null

        // Enrich with task + agent context for richer AI prompt
        let enrichment: Partial<DecisionContext> = {}
        if (body.task_id) {
          const { data: task } = await supabase
            .from('tasks')
            .select('title, description, acceptance_criteria, assigned_unit_id')
            .eq('id', body.task_id).single()
          if (task) {
            enrichment = {
              task_title: task.title as string,
              task_description: task.description as string | undefined,
              task_acceptance_criteria: task.acceptance_criteria as string | undefined,
            }
            const aid = task.assigned_unit_id as string | null | undefined
            if (aid) {
              const { data: a } = await supabase
                .from('execution_units').select('name, agent_type, tools_allowed').eq('id', aid).single()
              if (a) {
                enrichment = {
                  ...enrichment,
                  agent_name: a.name as string,
                  agent_type: a.agent_type as string,
                  tools_allowed: (a.tools_allowed ?? []) as string[],
                }
              }
            }
          }
        }

        const ctx: DecisionContext = {
          action_type: body.action_type,
          risk_level: classification.level,
          classification_reason: classification.reason,
          agent_type: body.agent_type ?? enrichment.agent_type,
          tools_allowed: body.tools_allowed ?? enrichment.tools_allowed,
          policy_name: policy.matched_policy_name,
          project_name: project.name as string,
          project_goal: project.goal_statement as string | undefined,
          current_stage: stage ?? undefined,
          current_stage_name: stageDef?.name_zh,
          ...enrichment,
        }

        // V2.1+ — Spec flow: create approval_request first, then auto-decide.
        // This gives full audit trail + ability to retry decision later.
        const tempApproval = await createApprovalRequest(supabase, {
          userId: user.id, projectId: body.project_id,
          taskId: body.task_id ?? null,
          actionType: body.action_type,
          actionPayload: body.action_payload ?? {},
          riskLevel: classification.level,
          requiredApprovers: roles,
          classificationReason: classification.reason,
          expiresInHours: 72,
        })

        if (tempApproval) {
          const auto = await autoDecideApprovalRequest(supabase, user.id, tempApproval.id)
          if (auto.ok && auto.final_status === 'approved' && auto.resume_execution) {
            const result = await executeAction(supabase, user.id, body)
            await audit(supabase, user.id, 'auto_approval.granted', {
              resource_type: 'dispatch', resource_id: tempApproval.id,
              metadata: {
                project_id: body.project_id, action_type: body.action_type,
                source: 'rule_based', policy_name: policy.matched_policy_name,
                decisions: auto.decisions, result_kind: result.kind,
              },
            })
            return apiOk({
              dispatch: 'auto', source: 'rule_based',
              risk_level: classification.level,
              policy_name: policy.matched_policy_name,
              approval_id: tempApproval.id,
              ai_decisions: auto.decisions,
              ...result,
            })
          }
          if (auto.final_status === 'rejected') {
            return apiOk({
              dispatch: 'rejected', source: 'rule_based',
              approval_id: tempApproval.id, risk_level: classification.level,
              policy_name: policy.matched_policy_name,
              ai_decisions: auto.decisions,
              classification_reason: auto.decisions[0]?.reasoning ?? 'rejected by rules',
            }, { status: 202 })
          }
          // Escalated → return as pending_approval (visible in /approvals)
          return apiOk({
            dispatch: 'pending_approval', source: 'rule_based_escalated',
            approval_id: tempApproval.id, risk_level: classification.level,
            required_approvers: roles,
            policy_name: policy.matched_policy_name,
            classification_reason: 'Escalated by rule engine (insufficient evidence)',
            ai_decisions: auto.decisions,
          }, { status: 202 })
        }

        // Fallback: rule-based path failed → use Claude-based path (legacy)
        const ai = await aiManagersUnanimous(supabase, user.id, body.project_id, roles, ctx)

        if (ai.all_approved) {
          await audit(supabase, user.id, 'ai_manager.unanimous_approve', {
            resource_type: 'dispatch', resource_id: body.task_id ?? null,
            metadata: {
              project_id: body.project_id, action_type: body.action_type,
              risk_level: classification.level, roles,
              decisions: ai.decisions,
              policy_name: policy.matched_policy_name,
            },
          })
          const result = await executeAction(supabase, user.id, body)
          await audit(supabase, user.id, 'auto_approval.granted', {
            resource_type: 'dispatch', resource_id: body.task_id ?? null,
            metadata: {
              project_id: body.project_id, action_type: body.action_type,
              source: 'ai_manager', policy_name: policy.matched_policy_name,
              result_kind: result.kind,
            },
          })
          return apiOk({
            dispatch: 'auto', source: 'ai_manager',
            risk_level: classification.level,
            policy_name: policy.matched_policy_name,
            ai_decisions: ai.decisions.map(d => ({
              role: d.role, decision: d.decision, reasoning: d.reasoning, confidence: d.confidence,
            })),
            ...result,
          })
        }

        // AI rejected → escalate to human approval
        const rejecting = ai.decisions.find(d => d.decision === 'reject')

        await audit(supabase, user.id, 'ai_manager.rejected', {
          resource_type: 'dispatch',
          metadata: {
            project_id: body.project_id, action_type: body.action_type,
            roles, decisions: ai.decisions,
          },
        })

        const approval = await createApprovalRequest(supabase, {
          userId: user.id, projectId: body.project_id,
          taskId: body.task_id ?? null,
          actionType: body.action_type,
          actionPayload: { ...(body.action_payload ?? {}), ai_decisions: ai.decisions },
          riskLevel: classification.level,
          requiredApprovers: roles,
          classificationReason: `AI 经理拒绝 → 升级人工：${rejecting?.reasoning ?? '未达到批准标准'}`,
          expiresInHours: 72,
        })

        await audit(supabase, user.id, 'dispatch.blocked', {
          resource_type: 'approval_request', resource_id: approval?.id ?? null,
          metadata: {
            project_id: body.project_id, action_type: body.action_type,
            ai_rejected: true,
            policy_name: policy.matched_policy_name,
          },
        })

        return apiOk({
          dispatch: 'pending_approval', source: 'ai_manager_rejected',
          approval_id: approval?.id, risk_level: classification.level,
          required_approvers: roles,
          classification_reason: `AI 经理拒绝：${rejecting?.reasoning ?? '未达到批准标准'}`,
          ai_decisions: ai.decisions,
        }, { status: 202 })
      }

      case 'block': {
        await audit(supabase, user.id, 'auto_approval.rejected', {
          resource_type: 'dispatch',
          metadata: {
            project_id: body.project_id, action_type: body.action_type,
            policy_name: policy.matched_policy_name, reason: policy.reason,
          },
        })
        return apiError(`Action blocked by policy: ${policy.matched_policy_name}`, {
          status: 403, code: 'blocked_by_policy',
          detail: { reason: policy.reason },
        })
      }

      case 'human_required':
      default: {
        const approval = await createApprovalRequest(supabase, {
          userId: user.id, projectId: body.project_id,
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
            project_id: body.project_id, action_type: body.action_type,
            risk_level: classification.level,
            required_approvers: classification.required_approvers,
            policy_name: policy.matched_policy_name, reason: classification.reason,
          },
        })

        return apiOk({
          dispatch: 'pending_approval', source: 'policy',
          approval_id: approval.id, risk_level: classification.level,
          required_approvers: classification.required_approvers,
          classification_reason: classification.reason,
          policy_name: policy.matched_policy_name,
        }, { status: 202 })
      }
    }
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/dispatch', method: 'POST' })
    return apiError('Dispatch failed', { status: 500 })
  }
}

// ─────────────────────────────────────────────────
// Action executor
// ─────────────────────────────────────────────────
async function executeAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: { action_type: string; task_id?: string; action_payload?: Record<string, unknown> },
): Promise<{ kind: string; task_run_id?: string; detail?: unknown }> {
  if (body.action_type === 'task.run' || body.action_type.startsWith('task.run.')) {
    if (!body.task_id) throw new Error('task.run requires task_id')
    const outcome = await executeTaskRun({ supabase, userId, taskId: body.task_id })
    if ('ok' in outcome && outcome.ok) return { kind: 'task_run', task_run_id: outcome.task_run_id }
    if ('runtime_error' in outcome) return { kind: 'task_run_error', task_run_id: outcome.task_run_id, detail: outcome.runtime_error }
    if ('error' in outcome) return { kind: 'gate_blocked', detail: outcome.error }
    return { kind: 'unknown' }
  }
  return { kind: 'no_op', detail: 'Action type not yet supported by central dispatcher' }
}

export { executeAction, evaluateApprovalLevel }
