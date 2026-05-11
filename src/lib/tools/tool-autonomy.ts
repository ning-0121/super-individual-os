import type { SupabaseClient } from '@supabase/supabase-js'
import type { ManagerRole, RiskLevel } from '@/types'
import { findCapability, requiredApproversFor, type ToolCapability } from './capabilities'
import { classifySqlSafety } from './sql-safety'
import { executeToolCall as executeRawToolCall } from './router'
import { audit } from '@/lib/audit'
import { logger } from '@/lib/observability'

// ─────────────────────────────────────────────────
// V2.2 — Tool Autonomy Router
// Policy gate + capability classification + tool_runs recorder.
// Wraps the existing executeToolCall (router.ts) which already handles
// integration loading + secret decryption.
// ─────────────────────────────────────────────────

export interface AutonomousToolCall {
  // Canonical action like 'github.pr.create'
  capability_action: string
  // Original short action sent to the underlying handler ('createPullRequest')
  raw_tool: string
  raw_action: string
  params: Record<string, unknown>
  task_run_id?: string
  project_id?: string
  // If the caller has already created/approved an approval_request, pass its id
  approval_id?: string
}

export interface ToolAutonomyResult {
  ok: boolean
  status: 'success' | 'error' | 'blocked' | 'pending_approval'
  tool_run_id?: string
  capability?: ToolCapability
  risk_level: RiskLevel
  required_approvers: ManagerRole[]
  approval_id?: string
  result?: unknown
  error?: string
  block_reason?: string
}

// ─────────────────────────────────────────────────
// Pure helpers — exposed for tests
// ─────────────────────────────────────────────────

export function classifyToolRisk(
  capabilityAction: string,
  params: Record<string, unknown>,
): { capability: ToolCapability | null; risk_level: RiskLevel; flags: string[]; required_approvers: ManagerRole[]; escalation_reason?: string } {
  const cap = findCapability(capabilityAction)
  if (!cap) {
    return {
      capability: null, risk_level: 4 as RiskLevel,
      flags: ['unknown_capability'], required_approvers: ['ceo'],
      escalation_reason: 'Unknown capability — defaulting to CEO',
    }
  }

  let risk: RiskLevel = cap.risk_level
  const flags: string[] = []
  let escalation_reason: string | undefined

  // SQL-bearing actions: scan content and possibly upgrade risk
  if (cap.tool === 'supabase') {
    const sql = typeof params.sql === 'string' ? params.sql : ''
    if (sql) {
      const safety = classifySqlSafety(sql)
      flags.push(...safety.flags)
      if (safety.is_destructive) {
        risk = 4
        escalation_reason = 'destructive_sql_detected'
      } else if (safety.risk_level > risk) {
        risk = safety.risk_level
      }
    }
  }

  // GitHub: writing to main is forbidden — escalate
  if (cap.tool === 'github' && (cap.action === 'github.file.write' || cap.action === 'github.pr.create')) {
    const branch = String(params.branch ?? '').toLowerCase()
    const base   = String(params.base ?? '').toLowerCase()
    if (branch === 'main' || branch === 'master') {
      flags.push('write_to_main')
      risk = 4
      escalation_reason = 'github_write_to_main_forbidden'
    }
    if (cap.action === 'github.pr.create' && (!base || base === branch)) {
      flags.push('pr_missing_base')
    }
  }

  // GitHub merge — always L4 (merging is the irreversible step)
  if (cap.action === 'github.pr.merge') {
    risk = 4
  }

  let required: ManagerRole[]
  if (risk === 4) {
    required = ['ceo']
  } else {
    required = requiredApproversFor({ ...cap, risk_level: risk })
  }

  return {
    capability: cap,
    risk_level: risk,
    flags,
    required_approvers: required,
    escalation_reason,
  }
}

// ─────────────────────────────────────────────────
// DB-touching: record + execute
// ─────────────────────────────────────────────────

async function createToolRun(
  supabase: SupabaseClient, userId: string, call: AutonomousToolCall,
  classification: ReturnType<typeof classifyToolRisk>,
  status: ToolAutonomyResult['status'],
  approvalId?: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.from('tool_runs').insert({
    user_id: userId,
    task_run_id: call.task_run_id ?? null,
    project_id: call.project_id ?? null,
    tool: classification.capability?.tool ?? call.raw_tool,
    action: call.capability_action,
    params: call.params,
    status,
    risk_level: classification.risk_level,
    required_approvers: classification.required_approvers,
    approval_id: approvalId ?? call.approval_id ?? null,
  }).select('id').single()
  if (error) {
    logger.warn('tool_run.insert_fail', { error_message: error.message })
    return undefined
  }
  return data?.id as string | undefined
}

async function finalizeToolRun(
  supabase: SupabaseClient, userId: string, runId: string,
  patch: { status: ToolAutonomyResult['status']; result?: unknown; error_message?: string; duration_ms: number },
): Promise<void> {
  await supabase.from('tool_runs').update({
    status: patch.status,
    result: (patch.result ?? {}) as Record<string, unknown>,
    error_message: patch.error_message ?? null,
    duration_ms: patch.duration_ms,
    finished_at: new Date().toISOString(),
  }).eq('id', runId).eq('user_id', userId)
}

export async function executeAutonomousToolCall(
  supabase: SupabaseClient, userId: string, call: AutonomousToolCall,
  opts: { approved?: boolean } = {},
): Promise<ToolAutonomyResult> {
  const start = Date.now()
  const classification = classifyToolRisk(call.capability_action, call.params)

  // L0 / L1 → auto-execute (with audit + tool_run record)
  // L2+ → require approval. If the caller passed `approved: true` (i.e. an
  //       approval_request was already resolved), proceed; otherwise block.
  const needsApproval = classification.risk_level >= 2
  const allowed = !needsApproval || opts.approved === true

  if (!allowed) {
    const runId = await createToolRun(supabase, userId, call, classification, 'pending_approval')
    await audit(supabase, userId, 'tool.blocked' as never, {
      resource_type: 'tool_run', resource_id: runId,
      metadata: {
        capability_action: call.capability_action,
        risk_level: classification.risk_level,
        flags: classification.flags,
        escalation_reason: classification.escalation_reason,
        required_approvers: classification.required_approvers,
      },
    } as never)
    return {
      ok: false, status: 'pending_approval',
      tool_run_id: runId,
      capability: classification.capability ?? undefined,
      risk_level: classification.risk_level,
      required_approvers: classification.required_approvers,
      block_reason: classification.escalation_reason ?? `Requires approval: ${classification.required_approvers.join(', ')}`,
    }
  }

  const runId = await createToolRun(supabase, userId, call, classification, 'success')

  try {
    const raw = await executeRawToolCall(
      { tool: call.raw_tool, action: call.raw_action, params: call.params },
      userId, supabase,
    )

    if (raw.status === 'error') {
      if (runId) await finalizeToolRun(supabase, userId, runId, {
        status: 'error', error_message: raw.error,
        duration_ms: Date.now() - start,
      })
      await audit(supabase, userId, 'tool.exec_fail' as never, {
        resource_type: 'tool_run', resource_id: runId,
        metadata: { capability_action: call.capability_action, error: raw.error },
      } as never)
      return {
        ok: false, status: 'error', tool_run_id: runId,
        capability: classification.capability ?? undefined,
        risk_level: classification.risk_level,
        required_approvers: classification.required_approvers,
        error: raw.error,
      }
    }

    if (runId) await finalizeToolRun(supabase, userId, runId, {
      status: 'success', result: raw.result, duration_ms: Date.now() - start,
    })
    await audit(supabase, userId, 'tool.exec_ok' as never, {
      resource_type: 'tool_run', resource_id: runId,
      metadata: { capability_action: call.capability_action, risk_level: classification.risk_level },
    } as never)

    // V2.5+ — Activity hook: deployment / migration successes land on the project timeline
    if (call.project_id) {
      const isDeploy    = /vercel\.deploy/i.test(call.capability_action)
      const isMigration = /supabase\.migration\.(apply_staging|apply_production)/i.test(call.capability_action)
      if (isDeploy || isMigration) {
        const { appendActivity } = await import('@/services/project-context')
        await appendActivity(supabase, userId, call.project_id, {
          activity_type: 'deployment',
          title: `✓ ${call.capability_action}`,
          summary: '',
          metadata: { tool_run_id: runId, result: raw.result },
        }).catch(() => {})
      }
    }

    return {
      ok: true, status: 'success', tool_run_id: runId,
      capability: classification.capability ?? undefined,
      risk_level: classification.risk_level,
      required_approvers: classification.required_approvers,
      result: raw.result,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (runId) await finalizeToolRun(supabase, userId, runId, {
      status: 'error', error_message: msg, duration_ms: Date.now() - start,
    })
    return {
      ok: false, status: 'error', tool_run_id: runId,
      capability: classification.capability ?? undefined,
      risk_level: classification.risk_level,
      required_approvers: classification.required_approvers,
      error: msg,
    }
  }
}
