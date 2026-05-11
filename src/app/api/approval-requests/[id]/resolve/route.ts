import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import { resolveAllRequiredRoles } from '@/services/managers'
import { executeTaskRun } from '@/lib/ai/run-task'
import { appendActivity } from '@/services/project-context'
import type { ApprovalRequest } from '@/types'

/**
 * Phase 2A — User-facing resolve endpoint.
 * The user acts as the umbrella authority (CEO) across all required roles.
 *
 * Body: { decision: 'approved' | 'rejected', reason?: string }
 *
 * On approve: status=approved, manager_decisions written for every required role,
 * underlying action triggered (currently: task.run).
 * On reject: status=rejected, no execution.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const { id } = await params
    const body = await req.json() as { decision: 'approved' | 'rejected'; reason?: string }

    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      return apiError('decision must be "approved" or "rejected"', { status: 400, code: 'invalid_decision' })
    }

    const result = await resolveAllRequiredRoles(supabase, {
      userId: user.id,
      requestId: id,
      decision: body.decision,
      reason: body.reason,
    })

    if (!result.ok) {
      return apiError(result.error ?? 'Resolve failed', { status: 400 })
    }

    const r = result.request as ApprovalRequest

    await audit(supabase, user.id, 'approval.resolved', {
      resource_type: 'approval_request', resource_id: r.id,
      metadata: {
        project_id: r.project_id,
        decision: body.decision,
        new_status: result.status,
        action_type: r.action_type,
        risk_level: r.risk_level,
        required_approvers: r.required_approvers,
        reason: body.reason,
      },
    })

    // Approved → trigger underlying action
    if (result.status === 'approved') {
      let execution: Record<string, unknown> = { kind: 'no_op' }

      if (r.action_type === 'task.run' || r.action_type.startsWith('task.run.')) {
        const taskId = r.task_id ?? (r.action_payload as { task_id?: string }).task_id
        if (taskId) {
          const out = await executeTaskRun({ supabase, userId: user.id, taskId })
          if ('ok' in out && out.ok) {
            execution = { kind: 'task_run', task_run_id: out.task_run_id }
          } else if ('runtime_error' in out) {
            execution = { kind: 'task_run_error', task_run_id: out.task_run_id, error: out.runtime_error }
          } else if ('error' in out) {
            execution = { kind: 'gate_blocked', error: out.error }
          }
        } else {
          execution = { kind: 'ready_for_execution', detail: 'No task_id; user must invoke manually' }
        }
      } else {
        execution = { kind: 'ready_for_execution', detail: `Action ${r.action_type} not auto-triggered` }
      }

      await audit(supabase, user.id, 'dispatch.approved', {
        resource_type: 'approval_request', resource_id: r.id,
        metadata: {
          project_id: r.project_id,
          action_type: r.action_type,
          execution_kind: execution.kind,
        },
      })

      // V2.5: feed approval into project memory kernel
      if (r.project_id) {
        await appendActivity(supabase, user.id, r.project_id, {
          activity_type: 'approval',
          title: `已批准 ${r.action_type}`,
          summary: body.reason ?? '',
          metadata: { execution_kind: (execution as { kind?: string }).kind, risk_level: r.risk_level },
        }).catch(() => {})
      }

      return apiOk({ status: 'approved', execution })
    }

    // Rejected
    if (r.project_id) {
      await appendActivity(supabase, user.id, r.project_id, {
        activity_type: 'approval',
        title: `已拒绝 ${r.action_type}`,
        summary: body.reason ?? '',
        metadata: { decision: 'rejected', risk_level: r.risk_level },
      }).catch(() => {})
    }
    return apiOk({ status: 'rejected' })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/approval-requests/[id]/resolve', method: 'POST' })
    return apiError('Resolve failed', { status: 500 })
  }
}
