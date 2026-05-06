import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { createDefaultManagersForProject } from '@/services/managers'
import { seedGrowthTasksForSystem } from '@/services/growth'

// ─────────────────────────────────────────────────
// V2.3 — One-shot venture bootstrap
// Creates System → Project → links them → seeds 7 default managers
// → seeds 6 default growth experiments. Returns IDs for redirect.
// ─────────────────────────────────────────────────

interface Body {
  // System
  system_name: string
  system_type?: string                // 'startup' | 'consulting' | 'product' | ...
  business_goal?: string              // 3-month goal
  owner_manager?: string              // 'ceo' | 'engineering_manager' | ...

  // Project (the first project under this system)
  project_name: string
  project_description?: string
  north_star_metric?: string          // e.g. "首批付费用户数"
  north_star_target?: string          // e.g. "30"
  monthly_focus?: string              // current month's focus

  // Optional flags
  seed_growth_tasks?: boolean         // default true (uses defaults; ignored if `growth_experiments` provided)
  seed_default_managers?: boolean     // default true

  // V2.3 — AI-drafted starter content (optional)
  starter_tasks?: Array<{ title: string; description?: string; assigned_role?: string; priority?: 'high' | 'medium' | 'low' }>
  growth_experiments?: Array<{ name: string; channel?: string; hypothesis?: string; target_metric?: string }>
  budget?: { total_usd?: number; breakdown?: Array<{ item: string; usd: number; rationale?: string }> }
  workflow?: { weekly_cadence?: string; escalation_to_ceo?: string[]; autonomous_actions?: string[] }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  let body: Body
  try { body = await req.json() as Body } catch { return apiError('invalid JSON', { status: 400 }) }

  if (!body.system_name?.trim())  return apiError('system_name required',  { status: 400 })
  if (!body.project_name?.trim()) return apiError('project_name required', { status: 400 })

  const seedManagers = body.seed_default_managers !== false
  const seedGrowth   = body.seed_growth_tasks !== false

  // 1. Create the System (with budget + workflow stored in metadata)
  const { data: system, error: sysErr } = await supabase.from('systems').insert({
    user_id: user.id,
    name: body.system_name.trim(),
    description: body.business_goal?.trim() ?? '',
    status: 'active',
    metadata: {
      type: body.system_type ?? 'startup',
      business_goal: body.business_goal ?? '',
      owner_manager: body.owner_manager ?? 'ceo',
      created_via: 'new_venture_wizard',
      budget: body.budget ?? null,
      workflow: body.workflow ?? null,
    },
  }).select().single()
  if (sysErr || !system) return apiError(sysErr?.message ?? 'system insert failed', { status: 400 })

  await audit(supabase, user.id, 'system.created' as never, {
    resource_type: 'system', resource_id: system.id,
    metadata: { source: 'new_venture_wizard' },
  } as never)

  // 2. Create the first Project
  const { data: project, error: projErr } = await supabase.from('projects').insert({
    user_id: user.id,
    name: body.project_name.trim(),
    description: body.project_description ?? '',
    status: 'active',
    priority: 'high',
    category: body.system_type ?? 'startup',
    north_star_metric: body.north_star_metric ?? '',
    north_star_target: body.north_star_target ?? '',
    north_star_current: '0',
    monthly_focus: body.monthly_focus ?? '',
    goal_statement: body.business_goal ?? '',
    plan_generated: false,
    current_stage: 0,
    stage_history: [],
    stage_metadata: {},
  }).select().single()
  if (projErr || !project) {
    // Roll back the system if project creation fails
    await supabase.from('systems').delete().eq('id', system.id)
    return apiError(projErr?.message ?? 'project insert failed', { status: 400 })
  }

  // 3. Link them
  await supabase.from('system_projects').insert({
    user_id: user.id,
    system_id: system.id,
    project_id: project.id,
    role: 'primary',
  })

  await audit(supabase, user.id, 'system.linked_project' as never, {
    resource_type: 'system', resource_id: system.id,
    metadata: { project_id: project.id, role: 'primary' },
  } as never)

  // 4. Seed default managers (7 roles) — non-blocking error
  let managers_seeded = 0
  if (seedManagers) {
    try {
      const ms = await createDefaultManagersForProject(supabase, user.id, project.id)
      managers_seeded = ms.length
    } catch { /* best-effort */ }
  }

  // 5. Seed growth experiments — prefer AI-drafted list, else defaults
  let growth_seeded = 0
  if (Array.isArray(body.growth_experiments) && body.growth_experiments.length > 0) {
    const rows = body.growth_experiments.slice(0, 12).map(g => ({
      user_id: user.id, system_id: system.id, project_id: null,
      name: (g.name ?? 'Untitled').slice(0, 200),
      channel: g.channel ?? '',
      hypothesis: g.hypothesis ?? '',
      target_metric: g.target_metric ?? '',
      baseline_value: '', current_value: '', target_value: '',
      status: 'planning' as const,
    }))
    const { error: gErr } = await supabase.from('growth_experiments').insert(rows)
    if (!gErr) growth_seeded = rows.length
  } else if (seedGrowth) {
    const r = await seedGrowthTasksForSystem(supabase, user.id, system.id)
    if (r.ok) growth_seeded = r.created
  }

  // 6. Seed AI-drafted starter tasks (best-effort)
  let tasks_seeded = 0
  if (Array.isArray(body.starter_tasks) && body.starter_tasks.length > 0) {
    const rows = body.starter_tasks.slice(0, 20).map(t => ({
      user_id: user.id, project_id: project.id, parent_task_id: null,
      title: (t.title ?? 'Untitled').slice(0, 200),
      description: t.description ?? '',
      status: 'pending' as const,
      priority: t.priority ?? 'medium',
      workflow_status: 'pending',
    }))
    const { error: tErr } = await supabase.from('tasks').insert(rows)
    if (!tErr) tasks_seeded = rows.length
  }

  return Response.json({
    ok: true,
    system_id: system.id,
    project_id: project.id,
    managers_seeded,
    growth_seeded,
    tasks_seeded,
    redirect_to: `/systems/${system.id}`,
  }, { status: 201 })
}
