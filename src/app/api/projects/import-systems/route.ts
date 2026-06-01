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

  // 1. Umbrella System
  const { data: system, error: sysErr } = await supabase.from('systems').insert({
    user_id: userId,
    name: systemName,
    description: body.business_goal?.trim() ?? '导入的现有项目集',
    status: 'active',
    metadata: {
      type: 'portfolio', business_goal: body.business_goal ?? '统一管理已有项目',
      owner_manager: 'ceo', created_via: 'import_systems', imported_count: projects.length,
    },
  }).select().single()
  if (sysErr || !system) return apiError(sysErr?.message ?? 'system insert failed', { status: 400 })

  await audit(supabase, userId, 'system.created', {
    resource_type: 'system', resource_id: system.id as string,
    metadata: { source: 'import_systems', count: projects.length },
  })

  const now = new Date().toISOString()
  const results: Array<{
    name: string; project_id?: string; ok: boolean;
    managers?: number; report?: boolean; error?: string
  }> = []

  // 2. Per-project full wiring (best-effort — one failure doesn't sink the rest)
  for (const p of projects) {
    try {
      const stageNum = Number.isFinite(p.current_stage) ? Math.max(0, Math.min(5, Math.trunc(p.current_stage as number))) : 0
      const ownerRole = VALID_ROLES.has(p.owner_manager ?? '') ? (p.owner_manager as string) : 'ceo'

      // 2a. Project row
      const { data: project, error: projErr } = await supabase.from('projects').insert({
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
      }).select('id, name').single()
      if (projErr || !project) { results.push({ name: p.name, ok: false, error: projErr?.message ?? 'project insert failed' }); continue }
      const projectId = project.id as string

      // 2b. Link to umbrella system
      await supabase.from('system_projects').insert({
        user_id: userId, system_id: system.id, project_id: projectId,
        role: results.length === 0 ? 'primary' : 'member',
      })

      // 2c. Seed managers (so owner_manager actually exists)
      let managers = 0
      try { managers = (await createDefaultManagersForProject(supabase, userId, projectId)).length } catch { /* best-effort */ }

      // 2d. Project context — write the real operating state, then LOCK it.
      await getOrCreateContext(supabase, userId, projectId)
      await updateContext(supabase, userId, projectId, {
        project_goal: p.project_goal ?? '',
        current_stage: `stage ${stageNum}`,
        current_focus: p.monthly_focus ?? '',
        blockers: (p.blockers ?? []).filter(Boolean).slice(0, 20).map(text => ({ at: now, text })),
        next_actions: (p.next_actions ?? []).filter(Boolean).slice(0, 20).map(text => ({ at: now, text })),
      } as never)
      await setContextLock(supabase, userId, projectId, true)

      // 2e. Activity log — the import itself is a context_update event
      await appendActivity(supabase, userId, projectId, {
        activity_type: 'context_update',
        title: `导入项目：${project.name}`,
        summary: `goal=${p.project_goal ?? '—'} · stage ${stageNum} · owner=${ownerRole}`,
        metadata: { source: 'import_systems', owner_manager: ownerRole, north_star_metric: p.north_star_metric ?? '' },
      })

      // 2f. Handoff summary (also writes an ai_summary activity)
      try { await generateHandoff(supabase, userId, projectId) } catch { /* best-effort */ }

      // 2g. First manager report from the owner manager
      let report = false
      try {
        const rep = await generateManagerReport(supabase, userId, {
          role: ownerRole, report_type: 'daily', project_id: projectId, system_id: system.id as string,
        })
        report = !!rep
      } catch { /* best-effort */ }

      results.push({ name: project.name as string, project_id: projectId, ok: true, managers, report })
    } catch (e) {
      results.push({ name: p.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  if (succeeded === 0) {
    // Nothing landed — roll back the empty umbrella.
    await supabase.from('systems').delete().eq('id', system.id)
    return apiError('All project imports failed', { status: 400 })
  }

  return Response.json({
    ok: true,
    system_id: system.id,
    system_name: systemName,
    imported: succeeded,
    total: projects.length,
    results,
  })
}
