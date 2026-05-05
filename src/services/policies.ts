import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionPolicy, ManagerRole, RiskLevel } from '@/types'
import { DEFAULT_POLICIES } from '@/lib/managers/default-policies'
import { evaluatePolicies, type EvalContext, type EvalResult } from '@/lib/managers/policy-evaluator'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// Seed defaults for a user (idempotent)
// ─────────────────────────────────────────────────
export async function seedDefaultPolicies(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('execution_policies')
    .select('policy_name')
    .eq('user_id', userId)
    .is('project_id', null)

  const have = new Set((existing ?? []).map(r => r.policy_name as string))
  const missing = DEFAULT_POLICIES.filter(p => !have.has(p.policy_name))
  if (missing.length === 0) return

  const rows = missing.map(p => ({
    user_id: userId,
    project_id: null,
    scope: 'global',
    policy_name: p.policy_name,
    policy_type: p.rule.action,
    rule: p.rule,
    priority: p.priority,
    is_active: true,
  }))

  const { error } = await supabase.from('execution_policies').insert(rows)
  if (error) logger.warn('policies.seed_fail', { error_message: error.message })
  else logger.info('policies.seeded', { user_id: userId, count: rows.length })
}

// ─────────────────────────────────────────────────
// Load applicable policies (project-specific override globals)
// ─────────────────────────────────────────────────
export async function loadPolicies(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
): Promise<ExecutionPolicy[]> {
  let query = supabase
    .from('execution_policies').select('*')
    .eq('user_id', userId).eq('is_active', true)

  if (projectId) {
    // include global (NULL project_id) + project-specific
    query = query.or(`project_id.eq.${projectId},project_id.is.null`)
  } else {
    query = query.is('project_id', null)
  }

  const { data } = await query.order('priority', { ascending: false })
  return (data ?? []) as ExecutionPolicy[]
}

// ─────────────────────────────────────────────────
// One-shot helper: load + evaluate
// ─────────────────────────────────────────────────
export async function evaluateForDispatch(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
  ctx: EvalContext,
): Promise<EvalResult> {
  // Lazy seed defaults if user has no policies
  await seedDefaultPolicies(supabase, userId)
  const policies = await loadPolicies(supabase, userId, projectId)
  return evaluatePolicies(policies, ctx)
}

// ─────────────────────────────────────────────────
// V2.1+ Spec helpers — used by /api/dispatch and tests
// ─────────────────────────────────────────────────

export async function getPolicyForAction(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
  actionType: string,
  riskLevel: RiskLevel,
): Promise<ExecutionPolicy | null> {
  await seedDefaultPolicies(supabase, userId)
  const policies = await loadPolicies(supabase, userId, projectId)
  const result = evaluatePolicies(policies, { action_type: actionType, risk_level: riskLevel })
  if (!result.matched_policy_id) return null
  return policies.find(p => p.id === result.matched_policy_id) ?? null
}

export function evaluateExecutionPolicy(
  policies: ExecutionPolicy[],
  actionType: string,
  riskLevel: RiskLevel,
  riskFlags?: string[],
): EvalResult {
  return evaluatePolicies(policies, {
    action_type: actionType,
    risk_level: riskLevel,
    risk_flags: riskFlags,
  })
}

export async function shouldAutoApprove(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
  actionType: string,
  riskLevel: RiskLevel,
): Promise<boolean> {
  const result = await evaluateForDispatch(supabase, userId, projectId, {
    action_type: actionType,
    risk_level: riskLevel,
  })
  return result.decision === 'auto_approve'
}

export function getRequiredApproversFromPolicy(result: EvalResult): ManagerRole[] {
  if (result.ai_manager_roles_required && result.ai_manager_roles_required.length > 0) {
    return result.ai_manager_roles_required
  }
  if (result.ai_manager_role) return [result.ai_manager_role]
  if (result.require_ceo) return ['ceo' as ManagerRole]
  return []
}
