import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Manager, ManagerRole, ManagerDecision, ManagerDecisionType,
  ApprovalRequest, ApprovalStatus, ApproverAction, RiskLevel,
} from '@/types'
import { DEFAULT_MANAGERS } from '@/lib/managers/defaults'
import { classifyRisk, type ClassifyResult } from '@/lib/managers/risk-classifier'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// 1. Seed default managers for a project (7 roles)
// Idempotent — safe to call multiple times
// ─────────────────────────────────────────────────
export async function createDefaultManagersForProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<Manager[]> {
  // Check if already seeded
  const { data: existing } = await supabase
    .from('managers')
    .select('role')
    .eq('user_id', userId)
    .eq('project_id', projectId)

  const existingRoles = new Set((existing ?? []).map(m => m.role as ManagerRole))
  const toCreate = DEFAULT_MANAGERS.filter(d => !existingRoles.has(d.role))
  if (toCreate.length === 0) {
    return getProjectManagers(supabase, userId, projectId)
  }

  const rows = toCreate.map(d => ({
    user_id: userId,
    project_id: projectId,
    role: d.role,
    domain: d.domain,
    name: d.name,
    avatar: d.avatar,
    description: d.description,
    authority_level: d.authority_level,
    system_prompt: d.system_prompt,
    is_active: true,
  }))

  const { error } = await supabase.from('managers').insert(rows)
  if (error) {
    logger.warn('managers.seed_fail', { user_id: userId, project_id: projectId, error_message: error.message })
  } else {
    logger.info('managers.seeded', { user_id: userId, project_id: projectId, count: rows.length })
  }

  return getProjectManagers(supabase, userId, projectId)
}

// ─────────────────────────────────────────────────
// 2. List all managers for a project
// ─────────────────────────────────────────────────
export async function getProjectManagers(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<Manager[]> {
  const { data } = await supabase
    .from('managers')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('authority_level', { ascending: false })

  return (data ?? []) as Manager[]
}

// ─────────────────────────────────────────────────
// 3. Create a manager decision record
// ─────────────────────────────────────────────────
export async function createManagerDecision(
  supabase: SupabaseClient,
  params: {
    userId: string
    projectId: string
    managerId: string
    decisionType: ManagerDecisionType
    targetType: string
    targetId?: string | null
    reasoning?: string
    metadata?: Record<string, unknown>
  },
): Promise<ManagerDecision | null> {
  const { data, error } = await supabase.from('manager_decisions').insert({
    user_id: params.userId,
    project_id: params.projectId,
    manager_id: params.managerId,
    decision_type: params.decisionType,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    reasoning: params.reasoning ?? '',
    metadata: params.metadata ?? {},
  }).select().single()

  if (error) {
    logger.warn('manager_decision.create_fail', { error_message: error.message })
    return null
  }
  return data as ManagerDecision
}

// ─────────────────────────────────────────────────
// 4. Create an approval request
// ─────────────────────────────────────────────────
export async function createApprovalRequest(
  supabase: SupabaseClient,
  params: {
    userId: string
    projectId: string
    taskId?: string | null
    taskRunId?: string | null
    actionType: string
    actionPayload: Record<string, unknown>
    riskLevel: RiskLevel
    requiredApprovers: ManagerRole[]
    classificationReason: string
    expiresInHours?: number
  },
): Promise<ApprovalRequest | null> {
  const expiresAt = params.expiresInHours
    ? new Date(Date.now() + params.expiresInHours * 3600 * 1000).toISOString()
    : null

  const { data, error } = await supabase.from('approval_requests').insert({
    user_id: params.userId,
    project_id: params.projectId,
    task_id: params.taskId ?? null,
    task_run_id: params.taskRunId ?? null,
    action_type: params.actionType,
    action_payload: params.actionPayload,
    risk_level: params.riskLevel,
    required_approvers: params.requiredApprovers,
    classification_reason: params.classificationReason,
    expires_at: expiresAt,
    status: 'pending',
  }).select().single()

  if (error) {
    logger.error('approval_request.create_fail', { error_message: error.message })
    return null
  }
  logger.info('approval.requested', {
    user_id: params.userId, project_id: params.projectId,
    approval_id: data.id, action_type: params.actionType, risk_level: params.riskLevel,
  })
  return data as ApprovalRequest
}

// ─────────────────────────────────────────────────
// 5. Resolve an approval request (approve / reject)
// Records each approver's vote; flips to final status when all approvers
// have weighed in OR when a reject is recorded.
// ─────────────────────────────────────────────────
export async function resolveApprovalRequest(
  supabase: SupabaseClient,
  params: {
    userId: string
    requestId: string
    managerId: string
    role: ManagerRole
    decision: 'approve' | 'reject'
    reasoning?: string
  },
): Promise<{ ok: boolean; status: ApprovalStatus; error?: string }> {
  const { data: req } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', params.requestId)
    .eq('user_id', params.userId)
    .single()

  if (!req) return { ok: false, status: 'cancelled', error: 'Request not found' }

  const r = req as ApprovalRequest
  if (r.status !== 'pending') {
    return { ok: false, status: r.status, error: `Already ${r.status}` }
  }

  // Validate approver role is required
  const required = r.required_approvers ?? []
  if (!required.includes(params.role)) {
    return { ok: false, status: r.status, error: `Role ${params.role} not in required approvers` }
  }

  // Append vote
  const acted = (r.approvers_acted ?? []) as ApproverAction[]
  const newAct: ApproverAction = {
    role: params.role,
    manager_id: params.managerId,
    decision: params.decision === 'approve' ? 'approve' : 'reject',
    ts: new Date().toISOString(),
    reasoning: params.reasoning,
  }

  // Prevent same role voting twice
  if (acted.some(a => a.role === params.role)) {
    return { ok: false, status: r.status, error: `Role ${params.role} already voted` }
  }

  const newActed = [...acted, newAct]

  // Determine new status
  let newStatus: ApprovalStatus = 'pending'
  if (params.decision === 'reject') {
    newStatus = 'rejected'
  } else {
    // All required approvers approved?
    const approveRoles = newActed.filter(a => a.decision === 'approve').map(a => a.role)
    const allApproved = required.every(role => approveRoles.includes(role))
    if (allApproved) newStatus = 'approved'
  }

  const updates: Record<string, unknown> = {
    approvers_acted: newActed,
    status: newStatus,
  }
  if (newStatus !== 'pending') updates.resolved_at = new Date().toISOString()

  const { error: upErr } = await supabase
    .from('approval_requests').update(updates).eq('id', params.requestId).eq('user_id', params.userId)

  if (upErr) return { ok: false, status: r.status, error: upErr.message }

  // Record manager decision
  await createManagerDecision(supabase, {
    userId: params.userId,
    projectId: r.project_id,
    managerId: params.managerId,
    decisionType: params.decision === 'approve' ? 'approve' : 'reject',
    targetType: 'approval_request',
    targetId: r.id,
    reasoning: params.reasoning,
    metadata: { action_type: r.action_type, role: params.role },
  })

  logger.info('approval.resolved', {
    user_id: params.userId, project_id: r.project_id,
    approval_id: r.id, role: params.role, decision: params.decision, new_status: newStatus,
  })

  return { ok: true, status: newStatus }
}

// ─────────────────────────────────────────────────
// 6. Pure helper — exposes risk classifier through service layer
// Per V2.0 spec: evaluateApprovalLevel(actionType, riskFlags)
// ─────────────────────────────────────────────────
export function evaluateApprovalLevel(actionType: string, riskFlags?: string[]): ClassifyResult {
  return classifyRisk({ action_type: actionType, risk_flags: riskFlags })
}

// ─────────────────────────────────────────────────
// Helper: find manager by role in a project
// ─────────────────────────────────────────────────
export async function findManagerByRole(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  role: ManagerRole,
): Promise<Manager | null> {
  const { data } = await supabase
    .from('managers')
    .select('*')
    .eq('user_id', userId).eq('project_id', projectId).eq('role', role).maybeSingle()
  return (data as Manager) ?? null
}

// ─────────────────────────────────────────────────
// Phase 2A — Resolve all required roles at once.
// Models the user as the umbrella authority (CEO) acting on behalf of
// all required managers. Records one manager_decision per role.
// Used by /api/approval-requests/[id]/resolve.
// ─────────────────────────────────────────────────
export async function resolveAllRequiredRoles(
  supabase: SupabaseClient,
  params: {
    userId: string
    requestId: string
    decision: 'approved' | 'rejected'
    reason?: string
  },
): Promise<{ ok: boolean; status: ApprovalStatus; error?: string; request?: ApprovalRequest }> {
  const { data: req } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', params.requestId).eq('user_id', params.userId).single()

  if (!req) return { ok: false, status: 'cancelled', error: 'Request not found' }

  const r = req as ApprovalRequest
  if (r.status !== 'pending') return { ok: false, status: r.status, error: `Already ${r.status}` }

  const required = (r.required_approvers ?? []) as ManagerRole[]
  if (required.length === 0) return { ok: false, status: r.status, error: 'No required approvers' }

  const decisionType: ManagerDecisionType = params.decision === 'approved' ? 'approve' : 'reject'
  const ts = new Date().toISOString()

  // Look up each required manager + record decision
  const acted: ApproverAction[] = []
  const missingRoles: ManagerRole[] = []
  for (const role of required) {
    const mgr = await findManagerByRole(supabase, params.userId, r.project_id, role)
    if (!mgr) { missingRoles.push(role); continue }
    acted.push({ role, manager_id: mgr.id, decision: decisionType, ts, reasoning: params.reason })
    await createManagerDecision(supabase, {
      userId: params.userId,
      projectId: r.project_id,
      managerId: mgr.id,
      decisionType,
      targetType: 'approval_request',
      targetId: r.id,
      reasoning: params.reason,
      metadata: { action_type: r.action_type, role, decided_via: 'user_resolve' },
    })
  }

  if (missingRoles.length > 0) {
    return { ok: false, status: r.status, error: `Missing managers for roles: ${missingRoles.join(', ')}` }
  }

  const newStatus: ApprovalStatus = params.decision === 'approved' ? 'approved' : 'rejected'

  const { error: upErr } = await supabase
    .from('approval_requests')
    .update({ approvers_acted: acted, status: newStatus, resolved_at: ts })
    .eq('id', r.id).eq('user_id', params.userId)

  if (upErr) return { ok: false, status: r.status, error: upErr.message }

  logger.info('approval.resolved_all', {
    user_id: params.userId, project_id: r.project_id,
    approval_id: r.id, decision: params.decision, role_count: required.length,
  })

  return {
    ok: true, status: newStatus,
    request: { ...r, approvers_acted: acted, status: newStatus, resolved_at: ts },
  }
}
