import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { getSystemOverview } from '@/services/systems'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const overview = await getSystemOverview(supabase, user.id, id)
  if (!overview) return apiError('System not found', { status: 404 })

  const [
    { data: links },
    { data: managerReports },
    { data: experiments },
  ] = await Promise.all([
    supabase.from('system_projects').select('project_id, role').eq('user_id', user.id).eq('system_id', id),
    supabase.from('manager_reports').select('id, role, summary, source, generated_at, metrics')
      .eq('user_id', user.id).eq('system_id', id)
      .order('generated_at', { ascending: false }).limit(20),
    supabase.from('growth_experiments').select('*')
      .eq('user_id', user.id).eq('system_id', id)
      .order('updated_at', { ascending: false }),
  ])

  const projectIds = (links ?? []).map(l => l.project_id as string)
  let tasks: Array<{ id: string; title: string; project_id: string; workflow_status: string; created_at: string }> = []
  if (projectIds.length > 0) {
    const { data: t } = await supabase.from('tasks')
      .select('id, title, project_id, workflow_status, created_at')
      .in('project_id', projectIds).order('created_at', { ascending: false }).limit(30)
    tasks = (t ?? []) as typeof tasks
  }

  return Response.json({
    overview,
    manager_reports: managerReports ?? [],
    growth_experiments: experiments ?? [],
    tasks,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { error } = await supabase.from('systems').update({
    ...body, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id)
  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('systems').delete().eq('id', id).eq('user_id', user.id)
  if (error) return apiError(error.message, { status: 400 })
  return Response.json({ ok: true })
}
