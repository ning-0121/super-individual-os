import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { createDefaultManagersForProject } from '@/services/managers'
import { extractProjectNames } from '@/lib/projects/bulk-parser'

// ─────────────────────────────────────────────────
// V3.4 — Bulk project import
// POST /api/projects/bulk-import
// Body: {
//   system_name?: string,           // default '我的项目集'
//   business_goal?: string,         // optional umbrella goal
//   project_names?: string[],       // explicit list — wins if provided
//   raw_text?: string,              // OR free-form blurb to parse
//   seed_managers?: boolean,        // default true (per-project, 7 roles)
// }
//
// Pattern: one umbrella System → N Projects → link all → seed managers per
// project. Mirrors POST /api/new-venture's bootstrap but skips growth seed
// and starter tasks — bulk import is for things already in motion.
// ─────────────────────────────────────────────────

interface Body {
  system_name?: string
  business_goal?: string
  project_names?: string[]
  raw_text?: string
  seed_managers?: boolean
}

const MAX_PROJECTS = 20

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  let body: Body
  try { body = await req.json() as Body } catch { return apiError('invalid JSON', { status: 400 }) }

  // Resolve the project list — explicit array wins; otherwise parse raw text.
  let names: string[] = Array.isArray(body.project_names)
    ? body.project_names.map(n => String(n ?? '').trim()).filter(Boolean)
    : extractProjectNames(body.raw_text ?? '')
  names = names.slice(0, MAX_PROJECTS)

  if (names.length === 0) {
    return apiError('project_names empty — paste a list or provide raw_text', { status: 400 })
  }

  const systemName = (body.system_name ?? '我的项目集').trim().slice(0, 60) || '我的项目集'
  const seedManagers = body.seed_managers !== false

  // 1. Umbrella System
  const { data: system, error: sysErr } = await supabase.from('systems').insert({
    user_id: user.id,
    name: systemName,
    description: body.business_goal?.trim() ?? '把现有项目统一搬进来管理',
    status: 'active',
    metadata: {
      type: 'portfolio',
      business_goal: body.business_goal ?? '统一管理已有项目',
      owner_manager: 'ceo',
      created_via: 'bulk_import',
      imported_count: names.length,
    },
  }).select().single()
  if (sysErr || !system) return apiError(sysErr?.message ?? 'system insert failed', { status: 400 })

  await audit(supabase, user.id, 'system.created' as never, {
    resource_type: 'system', resource_id: system.id,
    metadata: { source: 'bulk_import', count: names.length },
  } as never)

  // 2. One Project per name
  const projectRows = names.map(name => ({
    user_id: user.id,
    name: name.slice(0, 80),
    description: '',
    status: 'active' as const,
    priority: 'medium' as const,
    category: 'portfolio',
    north_star_metric: '',
    north_star_target: '',
    north_star_current: '0',
    monthly_focus: '',
    goal_statement: '',
    plan_generated: false,
    current_stage: 0,
    stage_history: [],
    stage_metadata: {},
  }))

  const { data: insertedProjects, error: projErr } = await supabase.from('projects')
    .insert(projectRows).select('id, name')

  if (projErr || !insertedProjects || insertedProjects.length === 0) {
    // Roll back the system if no project landed.
    await supabase.from('systems').delete().eq('id', system.id)
    return apiError(projErr?.message ?? 'project insert failed', { status: 400 })
  }

  // 3. Link them all to the umbrella system
  const linkRows = insertedProjects.map((p, i) => ({
    user_id: user.id,
    system_id: system.id,
    project_id: p.id as string,
    role: i === 0 ? 'primary' : 'member',
  }))
  await supabase.from('system_projects').insert(linkRows)

  await audit(supabase, user.id, 'system.linked_project' as never, {
    resource_type: 'system', resource_id: system.id,
    metadata: { project_ids: insertedProjects.map(p => p.id), source: 'bulk_import' },
  } as never)

  // 4. Seed managers per project (best-effort, parallel)
  let managersSeeded = 0
  if (seedManagers) {
    const results = await Promise.allSettled(
      insertedProjects.map(p =>
        createDefaultManagersForProject(supabase, user.id, p.id as string),
      ),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') managersSeeded += r.value.length
    }
  }

  return Response.json({
    ok: true,
    system_id: system.id,
    system_name: systemName,
    projects: insertedProjects.map(p => ({ id: p.id, name: p.name })),
    project_count: insertedProjects.length,
    managers_seeded: managersSeeded,
  })
}
