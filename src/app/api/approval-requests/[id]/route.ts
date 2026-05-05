import { createClient } from '@/lib/supabase/server'
import { apiError, apiOk } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import {
  resolveApprovalRequest,
  findManagerByRole,
} from '@/services/managers'
import { executeTaskRun } from '@/lib/ai/run-task'
import type { ManagerRole, ApprovalRequest } from '@/types'

// ─────────────────────────────────────────────────
// GET — fetch single approval request
// ─────────────────────────────────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('approval_requests').select('*').eq('id', id).eq('user_id', user.id).single()
  if (error || !data) return apiError('Not found', { status: 404 })
  return Response.json(data)
}

// ─────────────────────────────────────────────────
// POST — vote (approve or reject) on this request
// Body: { role: ManagerRole, decision: 'approve' | 'reject', reasoning?: string }
// On final approval (all required approvers said yes), automatically
// dispatches the underlying action (currently: task.run).
// ─────────────────────────────────────────────────
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  try {
    const { id } = await params
    const body = await req.json() as {
      role: ManagerRole
      decision: 'approve' | 'reject'
      reasoning?: string
    }

    if (!body.role || !body.decision) {
      return apiError('role and decision required', { status: 400, code: 'missing_field' })
    }

    // Load approval request to know project context
    const { data: reqRow } = await supabase
      .from('approval_requests').select('*').eq('id', id).eq('user_id', user.id).single()
    if (!reqRow) return apiError('Approval request not found', { status: 404 })
    const ar = reqRow as ApprovalRequest

    // Find manager for this role in the project
    const manager = await findManagerByRole(supabase, user.id, ar.project_id, body.role)
    if (!manager) return apiError(`Manager for role ${body.role} not found`, { status: 404 })

    // Cast vote
    const result = await resolveApprovalRequest(supabase, {
      userId: user.id,
      requestId: id,
      managerId: manager.id,
      role: body.role,
      decision: body.decision,
      reasoning: body.reasoning,
    })

    if (!result.ok) return apiError(result.error ?? 'Resolve failed', { status: 400 })

    await audit(supabase, user.id, 'approval.resolved', {
      resource_type: 'approval_request', resource_id: id,
      metadata: { role: body.role, decision: body.decision, new_status: result.status },
    })

    // If fully approved, execute underlying action
    if (result.status === 'approved') {
      let executionResult: Record<string, unknown> = { kind: 'no_op' }
      if (ar.action_type === 'task.run' || ar.action_type.startsWith('task.run.')) {
        const taskId = ar.task_id ?? (ar.action_payload as { task_id?: string }).task_id
        if (taskId) {
          const out = await executeTaskRun({ supabase, userId: user.id, taskId })
          if ('ok' in out && out.ok) {
            executionResult = { kind: 'task_run', task_run_id: out.task_run_id }
          } else if ('runtime_error' in out) {
            executionResult = { kind: 'task_run_error', task_run_id: out.task_run_id, error: out.runtime_error }
          } else if ('error' in out) {
            executionResult = { kind: 'gate_blocked', error: out.error }
          }
        }
      }

      await audit(supabase, user.id, 'dispatch.approved', {
        resource_type: 'approval_request', resource_id: id,
        metadata: {
          project_id: ar.project_id,
          action_type: ar.action_type,
          execution_result: executionResult,
        },
      })

      return apiOk({ status: 'approved', execution: executionResult })
    }

    return apiOk({ status: result.status })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/approval-requests/[id]', method: 'POST' })
    return apiError('Resolve failed', { status: 500 })
  }
}
