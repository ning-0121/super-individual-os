import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { evaluateStageGate, advanceStage, type StageOutcome } from '@/lib/stages/engine'
import { STAGES, TOTAL_STAGES, getStage } from '@/lib/stages/definitions'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  const { data: project, error } = await supabase
    .from('projects').select('current_stage, stage_history, north_star_metric, north_star_target, north_star_current')
    .eq('id', projectId).eq('user_id', user.id).single()

  if (error || !project) return apiError('Project not found', { status: 404 })

  const currentStageId = (project.current_stage as number) ?? 1
  const gate = await evaluateStageGate(supabase, user.id, projectId, currentStageId)

  return Response.json({
    current_stage: currentStageId,
    total_stages: TOTAL_STAGES,
    stages: STAGES,
    history: project.stage_history ?? [],
    gate,
    project_metric: {
      name: project.north_star_metric ?? '',
      target: project.north_star_target ?? '',
      current: project.north_star_current ?? '',
    },
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as {
    to_stage: number
    outcome?: StageOutcome
    note?: string
    force?: boolean                       // skip gate check (for backward navigation / pivots)
  }

  if (!body.to_stage || !getStage(body.to_stage)) {
    return apiError('Invalid to_stage', { status: 400 })
  }

  // Read current stage to determine direction
  const { data: project } = await supabase
    .from('projects').select('current_stage').eq('id', projectId).eq('user_id', user.id).single()
  if (!project) return apiError('Project not found', { status: 404 })

  const currentStageId = (project.current_stage as number) ?? 1
  const direction: 'forward' | 'backward' | 'same' =
    body.to_stage > currentStageId ? 'forward'
    : body.to_stage < currentStageId ? 'backward'
    : 'same'

  // Forward: enforce gate unless force=true
  if (direction === 'forward' && !body.force) {
    const gate = await evaluateStageGate(supabase, user.id, projectId, currentStageId)
    if (!gate.can_advance) {
      return apiError('当前阶段闸门未通过', {
        status: 409,
        code: 'gate_blocked',
        detail: { blockers: gate.blockers, warnings: gate.warnings },
      })
    }
    // Forward advance: only allow +1 (or force-jump)
    if (body.to_stage !== currentStageId + 1) {
      return apiError('只能逐阶段推进（如需跳跃，请设 force=true）', {
        status: 400,
        code: 'non_sequential_forward',
      })
    }
  }

  const outcome: StageOutcome = body.outcome ?? (direction === 'backward' ? 'pivoted' : 'manual')
  const result = await advanceStage(supabase, user.id, projectId, body.to_stage, outcome, body.note)
  if (!result.ok) return apiError(result.error ?? 'Failed', { status: 500 })

  await audit(supabase, user.id, 'task_run.start' /* reusing event type for now */, {
    resource_type: 'project',
    resource_id: projectId,
    metadata: {
      stage_transition: true,
      from: result.from, to: result.to, outcome, note: body.note,
    },
  })

  return Response.json({ ok: true, from: result.from, to: result.to, outcome })
}
