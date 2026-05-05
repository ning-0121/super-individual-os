import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ApprovalRequest, ManagerRole, AutoDecision, RiskLevel,
} from '@/types'
import { findManagerByRole, createManagerDecision } from '@/services/managers'
import { audit } from '@/lib/audit'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.1+ — Rule-based auto decisions
// LLM reasoning is opt-in (system_prompt fields ready) — V2.2.
// Pure functions for safety: deterministic, testable, never crash.
// ─────────────────────────────────────────────────

export interface AutoDecisionInput {
  request: ApprovalRequest
  task?: { title: string; description: string; acceptance_criteria: string } | null
  agent?: { agent_type: string; tools_allowed: string[] } | null
}

export interface AutoDecisionOutput {
  decision: AutoDecision
  role: ManagerRole
  reasoning: string
  confidence: number
}

// ─────────────────────────────────────────────────
// Common safety checks
// ─────────────────────────────────────────────────
const DESTRUCTIVE_DB_PATTERNS = [
  /drop\s+(table|database|schema)/i,
  /delete\s+from\s+\w+\s*(?:;|$)/i,
  /truncate\s+/i,
]

function hasDestructiveSql(payload: Record<string, unknown>): boolean {
  // Look in common payload keys
  const candidates: string[] = []
  if (typeof payload.sql === 'string') candidates.push(payload.sql)
  if (typeof payload.body === 'string') candidates.push(payload.body)
  if (Array.isArray(payload.files)) {
    for (const f of payload.files as Array<{ content?: string }>) {
      if (typeof f.content === 'string') candidates.push(f.content)
    }
  }
  return candidates.some(s => DESTRUCTIVE_DB_PATTERNS.some(p => p.test(s)))
}

function hasRollbackPlan(payload: Record<string, unknown>): boolean {
  const txt = JSON.stringify(payload).toLowerCase()
  return /\b(rollback|revert|undo)\b/.test(txt)
}

function hasAcceptanceCriteria(input: AutoDecisionInput): boolean {
  return !!input.task?.acceptance_criteria && input.task.acceptance_criteria.trim().length > 5
}

function hasClearScope(input: AutoDecisionInput): boolean {
  const desc = input.task?.description ?? ''
  return desc.trim().length >= 30
}

// ─────────────────────────────────────────────────
// CTO — engineering / technical correctness
// ─────────────────────────────────────────────────
export function ctoAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const { request } = input
  const role: ManagerRole = 'engineering_manager'

  if (request.risk_level >= 4) {
    return { decision: 'escalate', role,
      reasoning: 'L4 critical action — escalating to CEO', confidence: 1 }
  }

  if (hasDestructiveSql(request.action_payload)) {
    return { decision: 'escalate', role,
      reasoning: 'Detected destructive SQL pattern (DROP/DELETE/TRUNCATE) — escalating', confidence: 1 }
  }

  // Migration without rollback → revise
  if (request.action_type.includes('migration') && !hasRollbackPlan(request.action_payload)) {
    return { decision: 'revise', role,
      reasoning: 'Migration lacks documented rollback plan — please add', confidence: 0.9 }
  }

  // L3 needs explicit acceptance criteria
  if (request.risk_level >= 3 && !hasAcceptanceCriteria(input)) {
    return { decision: 'revise', role,
      reasoning: 'L3 action requires explicit acceptance_criteria on the task', confidence: 0.85 }
  }

  // L2 reversible actions (PR / preview deploy / issue) → approve
  if (request.risk_level <= 2) {
    return { decision: 'approve', role,
      reasoning: 'L2 reversible scope (PR / preview); CTO standard approval', confidence: 0.8 }
  }

  // L3 with rollback + acceptance criteria → approve
  if (request.risk_level === 3 && hasRollbackPlan(request.action_payload) && hasAcceptanceCriteria(input)) {
    return { decision: 'approve', role,
      reasoning: 'L3 with documented rollback + acceptance criteria', confidence: 0.7 }
  }

  return { decision: 'revise', role,
    reasoning: 'Insufficient evidence to approve at this risk level', confidence: 0.6 }
}

// ─────────────────────────────────────────────────
// QA — verification / acceptance criteria
// ─────────────────────────────────────────────────
export function qaAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const { request } = input
  const role: ManagerRole = 'qa_manager'

  if (request.risk_level >= 4) {
    return { decision: 'escalate', role,
      reasoning: 'L4 critical — QA cannot auto-approve', confidence: 1 }
  }

  if (!hasAcceptanceCriteria(input) && request.risk_level >= 2) {
    return { decision: 'revise', role,
      reasoning: 'Cannot QA-approve without acceptance_criteria', confidence: 0.9 }
  }

  if (!hasClearScope(input) && request.risk_level >= 2) {
    return { decision: 'revise', role,
      reasoning: 'Task scope too vague — please expand description (≥30 chars)', confidence: 0.7 }
  }

  if (request.action_type.includes('migration') && !hasRollbackPlan(request.action_payload)) {
    return { decision: 'reject', role,
      reasoning: 'QA requires rollback plan for any migration', confidence: 0.95 }
  }

  if (request.risk_level <= 2) {
    return { decision: 'approve', role,
      reasoning: 'QA: L2 reversible with adequate scope', confidence: 0.75 }
  }

  if (request.risk_level === 3 && hasAcceptanceCriteria(input)) {
    return { decision: 'approve', role,
      reasoning: 'QA: L3 with verification plan in acceptance criteria', confidence: 0.7 }
  }

  return { decision: 'revise', role,
    reasoning: 'QA cannot verify success criteria — refine task', confidence: 0.6 }
}

// ─────────────────────────────────────────────────
// COO — operations
// ─────────────────────────────────────────────────
export function cooAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const role: ManagerRole = 'growth_manager'                // we use growth_manager for ops/COO
  if (input.request.risk_level >= 4) {
    return { decision: 'escalate', role, reasoning: 'L4 — CEO required', confidence: 1 }
  }
  return { decision: 'approve', role,
    reasoning: 'COO: operationally fine at this risk level', confidence: 0.7 }
}

// ─────────────────────────────────────────────────
// CPO — product fit / spec
// ─────────────────────────────────────────────────
export function cpoAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const role: ManagerRole = 'design_manager'
  const { request } = input
  if (request.risk_level >= 4) return { decision: 'escalate', role, reasoning: 'L4', confidence: 1 }
  if (!hasClearScope(input)) {
    return { decision: 'revise', role,
      reasoning: 'Product cannot validate without clearer scope', confidence: 0.7 }
  }
  return { decision: 'approve', role, reasoning: 'CPO: scope clear', confidence: 0.7 }
}

// ─────────────────────────────────────────────────
// CGO — growth (Chief Growth Officer)
// ─────────────────────────────────────────────────
export function cgoAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const role: ManagerRole = 'growth_manager'
  if (input.request.risk_level >= 4) {
    return { decision: 'escalate', role, reasoning: 'L4 — CEO required', confidence: 1 }
  }
  if (input.request.action_type.match(/mass|broadcast/i)) {
    return { decision: 'escalate', role,
      reasoning: 'Mass communication — escalating for review', confidence: 0.9 }
  }
  return { decision: 'approve', role, reasoning: 'CGO: standard growth experiment', confidence: 0.7 }
}

// ─────────────────────────────────────────────────
// CSO — strategy (Chief Strategy Officer)
// ─────────────────────────────────────────────────
export function csoAutoDecision(input: AutoDecisionInput): AutoDecisionOutput {
  const role: ManagerRole = 'risk_manager'
  if (input.request.risk_level >= 4) {
    return { decision: 'escalate', role, reasoning: 'L4 — CEO required', confidence: 1 }
  }
  return { decision: 'approve', role, reasoning: 'CSO: strategically aligned', confidence: 0.6 }
}

// ─────────────────────────────────────────────────
// Map ManagerRole → decision function
// ─────────────────────────────────────────────────
const ROLE_TO_DECIDER: Record<string, (i: AutoDecisionInput) => AutoDecisionOutput> = {
  engineering_manager: ctoAutoDecision,
  qa_manager:          qaAutoDecision,
  design_manager:      cpoAutoDecision,
  growth_manager:      cgoAutoDecision,
  risk_manager:        csoAutoDecision,
  finance_manager:     cooAutoDecision,                   // closest stand-in
  ceo:                 (i) => ({ decision: 'escalate', role: 'ceo',
                                  reasoning: 'CEO decisions require human action', confidence: 1 }),
}

// ─────────────────────────────────────────────────
// Auto-decide on an existing approval_request
// Returns array of decisions (one per required approver) + final status.
// ─────────────────────────────────────────────────
export interface AutoDecideResult {
  ok: boolean
  decisions: AutoDecisionOutput[]
  final_status: 'approved' | 'rejected' | 'pending' | 'escalated'
  resume_execution: boolean
  error?: string
}

export async function autoDecideApprovalRequest(
  supabase: SupabaseClient, userId: string, approvalId: string,
): Promise<AutoDecideResult> {
  // 1. Load request
  const { data: req } = await supabase.from('approval_requests')
    .select('*').eq('id', approvalId).eq('user_id', userId).single()
  if (!req) return {
    ok: false, decisions: [], final_status: 'pending',
    resume_execution: false, error: 'Approval request not found',
  }

  const r = req as ApprovalRequest
  if (r.status !== 'pending') return {
    ok: false, decisions: [], final_status: r.status as AutoDecideResult['final_status'],
    resume_execution: false, error: `Already ${r.status}`,
  }

  // L4 → always escalate
  if ((r.risk_level as RiskLevel) >= 4) {
    logger.info('auto_decide.escalate_l4', { approval_id: approvalId })
    return { ok: true, decisions: [], final_status: 'escalated', resume_execution: false }
  }

  // 2. Enrich context (task + agent)
  let task: AutoDecisionInput['task'] = null
  if (r.task_id) {
    const { data: t } = await supabase.from('tasks')
      .select('title, description, acceptance_criteria, assigned_unit_id').eq('id', r.task_id).single()
    if (t) {
      task = {
        title: (t.title as string) ?? '',
        description: (t.description as string) ?? '',
        acceptance_criteria: (t.acceptance_criteria as string) ?? '',
      }
    }
  }

  // 3. Run each required approver's auto-decision
  const required = (r.required_approvers ?? []) as ManagerRole[]
  if (required.length === 0) return {
    ok: false, decisions: [], final_status: 'pending',
    resume_execution: false, error: 'No required approvers',
  }

  const input: AutoDecisionInput = { request: r, task }
  const decisions: AutoDecisionOutput[] = []

  for (const role of required) {
    const decider = ROLE_TO_DECIDER[role]
    if (!decider) {
      decisions.push({ decision: 'escalate', role,
        reasoning: `No auto-decider for role ${role}`, confidence: 0 })
      continue
    }
    decisions.push(decider(input))
  }

  // 4. Combine: any escalate → escalate; any reject/revise → not approved; all approve → approved
  let finalStatus: AutoDecideResult['final_status'] = 'approved'
  if (decisions.some(d => d.decision === 'escalate')) finalStatus = 'escalated'
  else if (decisions.some(d => d.decision === 'reject')) finalStatus = 'rejected'
  else if (decisions.some(d => d.decision === 'revise')) finalStatus = 'rejected'  // revise = same as reject for queue
  else if (decisions.every(d => d.decision === 'approve')) finalStatus = 'approved'

  // 5. Persist manager_decisions (one per role)
  for (const d of decisions) {
    const mgr = await findManagerByRole(supabase, userId, r.project_id, d.role)
    if (!mgr) continue
    await createManagerDecision(supabase, {
      userId, projectId: r.project_id, managerId: mgr.id,
      decisionType: d.decision === 'approve' ? 'approve' :
                    d.decision === 'reject'  ? 'reject' :
                    d.decision === 'revise'  ? 'request_revision' : 'escalate',
      targetType: 'approval_request', targetId: r.id,
      reasoning: d.reasoning,
      metadata: {
        action_type: r.action_type, role: d.role,
        decided_via: 'rule_based_auto', confidence: d.confidence,
      },
    })
  }

  // 6. Update approval_request based on final status
  if (finalStatus === 'approved') {
    const acted = decisions.map(d => ({
      role: d.role,
      manager_id: '',
      decision: 'approve' as const,
      ts: new Date().toISOString(),
      reasoning: d.reasoning,
    }))
    await supabase.from('approval_requests').update({
      status: 'approved', approvers_acted: acted, resolved_at: new Date().toISOString(),
    }).eq('id', r.id).eq('user_id', userId)

    await audit(supabase, userId, 'auto_approval.granted', {
      resource_type: 'approval_request', resource_id: r.id,
      metadata: {
        project_id: r.project_id, action_type: r.action_type,
        source: 'rule_based_auto', decisions,
      },
    })

    return { ok: true, decisions, final_status: 'approved', resume_execution: true }
  }

  if (finalStatus === 'rejected') {
    const acted = decisions.map(d => ({
      role: d.role, manager_id: '',
      decision: (d.decision === 'approve' ? 'approve' : 'reject') as 'approve' | 'reject',
      ts: new Date().toISOString(),
      reasoning: d.reasoning,
    }))
    await supabase.from('approval_requests').update({
      status: 'rejected', approvers_acted: acted, resolved_at: new Date().toISOString(),
    }).eq('id', r.id).eq('user_id', userId)

    await audit(supabase, userId, 'auto_approval.rejected', {
      resource_type: 'approval_request', resource_id: r.id,
      metadata: {
        project_id: r.project_id, action_type: r.action_type,
        source: 'rule_based_auto', decisions,
      },
    })
    return { ok: true, decisions, final_status: 'rejected', resume_execution: false }
  }

  // escalated → leave pending for human (CEO queue)
  await audit(supabase, userId, 'ai_manager.rejected', {
    resource_type: 'approval_request', resource_id: r.id,
    metadata: {
      project_id: r.project_id, action_type: r.action_type,
      source: 'rule_based_auto', decisions,
      escalation_reason: 'one or more managers escalated',
    },
  })
  return { ok: true, decisions, final_status: 'escalated', resume_execution: false }
}
