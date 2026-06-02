import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { createDefaultManagersForProject } from '@/services/managers'
import {
  getOrCreateContext, updateContext, setContextLock, appendActivity, generateHandoff,
} from '@/services/project-context'
import { generateManagerReport } from '@/services/manager-reports'

// ─────────────────────────────────────────────────
// V3.5 — Import Existing Systems (rich, context-locked)
// POST /api/projects/import-systems
//
// Unlike bulk-import (names only), this captures real operating metadata per
// project and wires the full memory kernel on the way in:
//   create project → link to umbrella System → seed managers
//   → write + LOCK project_context → handoff summary → first manager report
//   → activity log
//
// The point: imported projects show real health on Mission Control and the
// manager reports have something to say (not empty).
// ─────────────────────────────────────────────────

const VALID_ROLES = new Set([
  'ceo', 'engineering_manager', 'design_manager', 'finance_manager',
  'growth_manager', 'qa_manager', 'risk_manager',
])

interface ImportProject {
  name: string
  project_goal?: string
  current_stage?: number
  north_star_metric?: string
  monthly_focus?: string
  blockers?: string[]
  next_actions?: string[]
  owner_manager?: string
}
interface Body {
  system_id?: string          // attach to existing System (skip create) — used by single 新建
  system_name?: string
  business_goal?: string
  projects?: ImportProject[]
}

const MAX_PROJECTS = 20

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })
  const userId = user.id

  let body: Body
  try { body = await req.json() as Body } catch { return apiError('invalid JSON', { status: 400 }) }

  const projects = (body.projects ?? [])
    .filter(p => p && typeof p.name === 'string' && p.name.trim())
    .slice(0, MAX_PROJECTS)
  if (projects.length === 0) return apiError('projects[] empty', { status: 400 })

  const systemName = (body.system_name ?? '我的项目集').trim().slice(0, 60) || '我的项目集'

  // 1. Resolve the umbrella System — attach to an existing one when system_id
  //    is given (single 新建 flow), otherwise create a fresh portfolio System.
  let system: { id: string } | null = null
  let createdSystem = false
  if (body.system_id) {
    const { data: existing } = await supabase.from('systems')
      .select('id').eq('id', body.system_id).eq('user_id', userId).maybeSingle()
    if (!existing) return apiError('system_id not found', { status: 404 })
    system = { id: existing.id as string }
  } else {
    const { data: created, error: sysErr } = await supabase.from('systems').insert({
      user_id: userId,
      name: systemName,
      description: body.business_goal?.trim() ?? '导入的现有项目集',
      status: 'active',
      metadata: {
        type: 'portfolio', business_goal: body.business_goal ?? '统一管理已有项目',
        owner_manager: 'ceo', created_via: 'import_systems', imported_count: projects.length,
      },
    }).select('id').single()
    if (sysErr || !created) return apiError(sysErr?.message ?? 'system insert failed', { status: 400 })
    system = { id: created.id as string }
    createdSystem = true
    await audit(supabase, userId, 'system.created', {
      resource_type: 'system', resource_id: system.id,
      metadata: { source: 'import_systems', count: projects.length },
    })
  }

  if (!system) return apiError('system resolution failed', { status: 500 })
  const systemId = system.id

  const now = new Date().toISOString()
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const results: Array<{
    name: string; project_id?: string; ok: boolean;
    managers?: number; report?: boolean; error?: string; warnings?: string[]
  }> = []

  // 2. Per-project wiring.
  // CORE = creating the project row. Everything after (system link, managers,
  // context+lock, handoff, manager report) is an ENHANCEMENT: it runs
  // best-effort and a failure is recorded as a warning, never sinks the
  // project. This is what makes import resilient to a missing v2.5 migration
  // (project_contexts / project_activity_logs absent) — you still get your
  // projects; the memory-kernel extras just degrade with a clear reason.
  for (const p of projects) {
    const warnings: string[] = []
    try {
      const stageNum = Number.isFinite(p.current_stage) ? Math.max(0, Math.min(5, Math.trunc(p.current_stage as number))) : 0
      const ownerRole = VALID_ROLES.has(p.owner_manager ?? '') ? (p.owner_manager as string) : 'ceo'

      // 2a. Project row — CORE. Try the full insert first; if the user's
      // schema predates some columns, fall back to a minimal insert so the
      // project still lands (then enrich best-effort below).
      const fullRow = {
        user_id: userId,
        name: p.name.trim().slice(0, 80),
        description: p.project_goal ?? '',
        status: 'active', priority: 'medium', category: 'portfolio',
        north_star_metric: p.north_star_metric ?? '',
        north_star_target: '', north_star_current: '0',
        monthly_focus: p.monthly_focus ?? '',
        goal_statement: p.project_goal ?? '',
        plan_generated: false,
        current_stage: stageNum, stage_history: [], stage_metadata: {},
      }
      let { data: project, error: projErr } =
        await supabase.from('projects').insert(fullRow).select('id, name').single()
      if (projErr) {
        warnings.push(`full insert failed (${projErr.message}); retried minimal`)
        ;({ data: project, error: projErr } = await supabase.from('projects')
          .insert({ user_id: userId, name: p.name.trim().slice(0, 80), status: 'active' })
          .select('id, name').single())
      }
      if (projErr || !project) {
        results.push({ name: p.name, ok: false, error: `project insert: ${projErr?.message ?? 'failed'}`, warnings: warnings.length ? warnings : undefined })
        continue
      }
      const projectId = project.id as string
      const isFirst = results.filter(r => r.ok).length === 0

      // 2b. Link to umbrella system (enhancement)
      try {
        const { error } = await supabase.from('system_projects').insert({
          user_id: userId, system_id: systemId, project_id: projectId,
          role: isFirst ? 'primary' : 'member',
        })
        if (error) warnings.push(`link: ${error.message}`)
      } catch (e) { warnings.push(`link: ${msg(e)}`) }

      // 2c. Seed managers (enhancement)
      let managers = 0
      try { managers = (await createDefaultManagersForProject(supabase, userId, projectId)).length }
      catch (e) { warnings.push(`managers: ${msg(e)}`) }

      // 2d. Project context — write operating state, then LOCK (enhancement; v2.5)
      try {
        await getOrCreateContext(supabase, userId, projectId)
        await updateContext(supabase, userId, projectId, {
          project_goal: p.project_goal ?? '',
          current_stage: `stage ${stageNum}`,
          current_focus: p.monthly_focus ?? '',
          blockers: (p.blockers ?? []).filter(Boolean).slice(0, 20).map(text => ({ at: now, text })),
          next_actions: (p.next_actions ?? []).filter(Boolean).slice(0, 20).map(text => ({ at: now, text })),
        } as never)
        await setContextLock(supabase, userId, projectId, true)
      } catch (e) { warnings.push(`context: ${msg(e)}`) }

      // 2e. Activity log (enhancement; v2.5)
      try {
        await appendActivity(supabase, userId, projectId, {
          activity_type: 'context_update',
          title: `导入项目：${project.name}`,
          summary: `goal=${p.project_goal ?? '—'} · stage ${stageNum} · owner=${ownerRole}`,
          metadata: { source: 'import_systems', owner_manager: ownerRole, north_star_metric: p.north_star_metric ?? '' },
        })
      } catch (e) { warnings.push(`activity: ${msg(e)}`) }

      // 2f. Handoff summary (enhancement)
      try { await generateHandoff(supabase, userId, projectId) } catch (e) { warnings.push(`handoff: ${msg(e)}`) }

      // 2g. First manager report from the owner manager (enhancement)
      let report = false
      try {
        const rep = await generateManagerReport(supabase, userId, {
          role: ownerRole, report_type: 'daily', project_id: projectId, system_id: systemId,
        })
        report = !!rep
      } catch (e) { warnings.push(`report: ${msg(e)}`) }

      results.push({
        name: project.name as string, project_id: projectId, ok: true,
        managers, report, warnings: warnings.length ? warnings : undefined,
      })
    } catch (e) {
      results.push({ name: p.name, ok: false, error: msg(e), warnings: warnings.length ? warnings : undefined })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  if (succeeded === 0) {
    // Nothing landed — roll back the umbrella (only if we created it) and
    // RETURN the per-project errors so the failure is diagnosable, not opaque.
    if (createdSystem) await supabase.from('systems').delete().eq('id', systemId)
    return Response.json({
      ok: false,
      error: 'All project imports failed',
      results,
    }, { status: 400 })
  }

  return Response.json({
    ok: true,
    system_id: systemId,
    system_name: systemName,
    imported: succeeded,
    total: projects.length,
    results,
  })
}
