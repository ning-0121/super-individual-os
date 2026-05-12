import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { classifyIntent, type CopilotIntent } from '@/lib/ai/copilot-intent'
import { generateManagerReport, listManagerReports } from '@/services/manager-reports'
import { resolveAllRequiredRoles } from '@/services/managers'
import { RISK_ORDER, type RiskLabel } from '@/lib/approvals/risk'
import { listActiveWorkflowRuns } from '@/services/workflow-runtime'

// POST /api/ai/copilot
// Body: { input: string }
// Returns: { intent, payload }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { input } = await req.json().catch(() => ({})) as { input?: string }
  if (!input || typeof input !== 'string') return apiError('input required', { status: 400 })

  const intent = classifyIntent(input)
  const payload = await loadPayload(supabase, user.id, intent)

  return Response.json({ intent, payload })
}

async function loadPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string, intent: CopilotIntent,
): Promise<Record<string, unknown>> {
  switch (intent.kind) {
    case 'list_systems': {
      const { data: systems } = await supabase.from('systems')
        .select('id, name, description, status, metadata')
        .eq('user_id', userId).order('created_at', { ascending: false })
      const { data: links } = await supabase.from('system_projects')
        .select('system_id').eq('user_id', userId)
      const counts = new Map<string, number>()
      for (const l of links ?? []) counts.set(l.system_id as string, (counts.get(l.system_id as string) ?? 0) + 1)
      return {
        systems: (systems ?? []).map(s => ({
          id: s.id, name: s.name, description: s.description,
          status: s.status,
          project_count: counts.get(s.id as string) ?? 0,
          business_goal: (s.metadata as Record<string, string> | null)?.business_goal ?? '',
        })),
      }
    }
    case 'list_projects': {
      const { data } = await supabase.from('projects')
        .select('id, name, status, current_stage, north_star_metric, north_star_target')
        .eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
      return { projects: data ?? [] }
    }
    case 'list_tasks': {
      const { data } = await supabase.from('tasks')
        .select('id, title, project_id, workflow_status, priority, created_at')
        .eq('user_id', userId).neq('workflow_status', 'completed')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }).limit(15)
      return { tasks: data ?? [] }
    }
    case 'list_approvals': {
      const { data } = await supabase.from('approval_requests')
        .select('id, action_type, risk_level, classification_reason, required_approvers, project_id, task_id, created_at')
        .eq('user_id', userId).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(20)
      return { approvals: data ?? [] }
    }
    case 'list_growth': {
      const { data } = await supabase.from('growth_experiments')
        .select('id, name, status, channel, target_metric, system_id')
        .eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
      return { experiments: data ?? [] }
    }
    case 'manager_report': {
      let reports = await listManagerReports(supabase, userId, {
        role: intent.role, limit: 10,
      })
      let just_generated = false

      // Auto-generate when no report exists for the requested role and the
      // user explicitly asked for a fresh one.
      if (intent.auto_generate && reports.length === 0) {
        if (intent.role) {
          await generateManagerReport(supabase, userId, {
            role: intent.role, report_type: 'daily',
          })
        } else {
          // "All managers" — generate one per featured role
          const ROLES = ['ceo', 'engineering_manager', 'finance_manager', 'growth_manager', 'design_manager']
          await Promise.all(ROLES.map(role =>
            generateManagerReport(supabase, userId, { role, report_type: 'daily' }),
          ))
        }
        reports = await listManagerReports(supabase, userId, { role: intent.role, limit: 10 })
        just_generated = true
      }
      return { reports, requested_role: intent.role ?? null, just_generated }
    }
    case 'blockers_overview': {
      // Pull most recent reports across all roles, surface only those with
      // blockers or needs_user_intervention.
      const all = await listManagerReports(supabase, userId, { limit: 30 })
      // Latest per role
      const latest = new Map<string, typeof all[number]>()
      for (const r of all) if (!latest.has(r.role)) latest.set(r.role, r)
      const blocked = Array.from(latest.values()).filter(r =>
        r.needs_user_intervention || (r.blockers ?? []).length > 0
      )
      // Also surface raw blocked tasks (open + 48h no activity)
      const since48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
      const { data: stuckTasks } = await supabase.from('tasks')
        .select('id, title, project_id, updated_at, workflow_status')
        .eq('user_id', userId)
        .not('workflow_status', 'in', '(completed,approved,archived)')
        .lt('updated_at', since48h)
        .order('updated_at', { ascending: true }).limit(10)
      return {
        blocked_reports: blocked,
        stuck_tasks: stuckTasks ?? [],
      }
    }
    case 'workflow_status': {
      // V2.9 — surface active workflow runs (top 10) for Copilot
      const runs = await listActiveWorkflowRuns(supabase, userId, 10)
      const blocked = runs.filter(r => r.status === 'blocked_approval')
      const failed_or_stuck = runs.filter(r => r.status === 'failed')
      return {
        active_count: runs.length,
        blocked_count: blocked.length,
        failed_count: failed_or_stuck.length,
        runs,
      }
    }
    case 'bulk_approve':
    case 'bulk_reject': {
      const isApprove = intent.kind === 'bulk_approve'
      const threshold = RISK_ORDER[intent.risk_label]
      const { data: rows } = await supabase.from('approval_requests')
        .select('id, action_type, risk_label, title').eq('user_id', userId).eq('status', 'pending')
      const filtered = (rows ?? []).filter(r => {
        const lvl = RISK_ORDER[(r.risk_label as RiskLabel) ?? 'low']
        return isApprove ? lvl <= threshold : lvl >= threshold
      })
      const ids = filtered.map(r => r.id as string)
      const decision = isApprove ? 'approved' as const : 'rejected' as const
      const results: Array<{ id: string; ok: boolean; action_type: string }> = []
      for (const r of filtered) {
        const out = await resolveAllRequiredRoles(supabase, {
          userId, requestId: r.id as string, decision,
          reason: `copilot_bulk_${intent.kind}`,
        })
        results.push({ id: r.id as string, ok: !!out.ok, action_type: r.action_type as string })
      }
      return {
        mode: intent.kind,
        risk_label: intent.risk_label,
        processed: ids.length,
        succeeded: results.filter(r => r.ok).length,
        items: results,
      }
    }
    case 'help':
    case 'nav':
    case 'start_venture':
    case 'chat':
      return {}
  }
}
