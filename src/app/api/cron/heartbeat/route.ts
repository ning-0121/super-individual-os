import { createAdminClient } from '@/lib/supabase/admin'
import { apiError, logger } from '@/lib/observability'
import { advanceWorkflowRun } from '@/services/workflow-runtime'
import { generateManagerReport, listManagerReports } from '@/services/manager-reports'
import { startOfToday } from '@/lib/cost/aggregate'

// ─────────────────────────────────────────────────
// V3.2 — Autonomy heartbeat (cron)
// Runs on a schedule (see vercel.json). For every active user it:
//   1. Advances active workflow runs through the FSM (promotes ready steps,
//      dispatches them) — deterministic, no LLM tokens.
//   2. Generates daily manager reports (rule-based synthesis, no LLM tokens),
//      idempotent: skips roles already reported today.
//
// This is what makes the system an OS rather than a dashboard — managers
// brief and workflows progress while the human is away.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We refuse
// to run if CRON_SECRET is unset (fail closed — never an open endpoint).
// ─────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FEATURED_ROLES = [
  'ceo', 'engineering_manager', 'finance_manager', 'growth_manager', 'design_manager',
] as const

const MAX_USERS_PER_RUN = 25
const MAX_RUNS_PER_USER = 50

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${secret}`) return true
  // Allow manual trigger in non-prod via ?secret=
  const url = new URL(req.url)
  return url.searchParams.get('secret') === secret
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return apiError('Unauthorized (set CRON_SECRET and send Bearer)', { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = Date.now()

  // Enumerate distinct users that own at least one non-archived project.
  const { data: projectRows, error: projErr } = await supabase.from('projects')
    .select('user_id, status')
    .neq('status', 'archived')
    .limit(5000)
  if (projErr) return apiError(projErr.message, { status: 500 })

  const userIds = [...new Set((projectRows ?? []).map(r => r.user_id as string).filter(Boolean))]
    .slice(0, MAX_USERS_PER_RUN)

  const todayStart = startOfToday()
  let workflowsAdvanced = 0
  let stepsAdvanced = 0
  let reportsGenerated = 0
  const perUser: Array<{ user_id: string; runs: number; steps: number; reports: number }> = []

  for (const userId of userIds) {
    let runsTouched = 0
    let userSteps = 0
    let userReports = 0

    // 1. Advance active workflow runs.
    const { data: runs } = await supabase.from('workflow_runs')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['running', 'pending'])
      .limit(MAX_RUNS_PER_USER)
    for (const run of runs ?? []) {
      try {
        const res = await advanceWorkflowRun(supabase, userId, run.id as string)
        if (res.ok) { runsTouched++; userSteps += res.advanced }
      } catch (e) {
        logger.warn('heartbeat.advance_fail', {
          user_id: userId, run_id: run.id as string,
          error_message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // 2. Generate daily manager reports, skipping roles already done today.
    try {
      const todays = await listManagerReports(supabase, userId, { report_type: 'daily', limit: 50 })
      const doneRoles = new Set(
        todays.filter(r => (r.generated_at ?? '') >= todayStart).map(r => r.role),
      )
      for (const role of FEATURED_ROLES) {
        if (doneRoles.has(role)) continue
        const rep = await generateManagerReport(supabase, userId, { role, report_type: 'daily' })
        if (rep) userReports++
      }
    } catch (e) {
      logger.warn('heartbeat.report_fail', {
        user_id: userId,
        error_message: e instanceof Error ? e.message : String(e),
      })
    }

    workflowsAdvanced += runsTouched
    stepsAdvanced += userSteps
    reportsGenerated += userReports
    perUser.push({ user_id: userId, runs: runsTouched, steps: userSteps, reports: userReports })
  }

  const summary = {
    ok: true,
    users_processed: userIds.length,
    workflows_advanced: workflowsAdvanced,
    steps_advanced: stepsAdvanced,
    reports_generated: reportsGenerated,
    duration_ms: Date.now() - startedAt,
    per_user: perUser,
  }
  logger.info('heartbeat.done', summary)
  return Response.json(summary)
}

export async function GET(req: Request)  { return handle(req) }
export async function POST(req: Request) { return handle(req) }
