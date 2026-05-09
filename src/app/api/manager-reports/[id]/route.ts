import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { markReportRead } from '@/services/manager-reports'
import { audit } from '@/lib/audit'

// PATCH /api/manager-reports/[id]
// Body: { action: 'mark_read' | 'convert_to_task'; task?: { title: string; project_id?: string } }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    action?: 'mark_read' | 'convert_to_task'
    task?: { title: string; description?: string; project_id?: string; priority?: string }
  }
  if (!body.action) return apiError('action required', { status: 400 })

  if (body.action === 'mark_read') {
    const r = await markReportRead(supabase, user.id, id)
    if (!r.ok) return apiError(r.error ?? 'failed', { status: 400 })
    return Response.json({ ok: true })
  }

  if (body.action === 'convert_to_task') {
    if (!body.task?.title) return apiError('task.title required', { status: 400 })
    // Pull report context to enrich the task
    const { data: report } = await supabase.from('manager_reports')
      .select('id, role, summary, blockers, next_actions, project_id')
      .eq('id', id).eq('user_id', user.id).maybeSingle()
    if (!report) return apiError('report not found', { status: 404 })

    const projectId = body.task.project_id ?? (report.project_id as string | null)
    if (!projectId) return apiError('task requires project_id (none on report either)', { status: 400 })

    const description = body.task.description ?? buildTaskDescriptionFromReport(report as never)

    const { data: task, error } = await supabase.from('tasks').insert({
      user_id: user.id,
      project_id: projectId,
      title: body.task.title,
      description,
      priority: body.task.priority ?? 'medium',
      workflow_status: 'todo',
    }).select('id, title').single()
    if (error || !task) return apiError(error?.message ?? 'task insert failed', { status: 400 })

    await audit(supabase, user.id, 'manager_report.converted_to_task' as never, {
      resource_type: 'manager_report', resource_id: id,
      metadata: { task_id: task.id, project_id: projectId },
    } as never)
    return Response.json({ ok: true, task })
  }

  return apiError('unknown action', { status: 400 })
}

function buildTaskDescriptionFromReport(r: {
  role: string; summary: string;
  blockers: string[]; next_actions: string[];
}): string {
  const lines: string[] = []
  lines.push(`来源：${r.role} Manager Report`)
  lines.push('')
  lines.push(`> ${r.summary}`)
  if (r.blockers?.length) {
    lines.push('')
    lines.push('阻塞：')
    for (const b of r.blockers) lines.push(`- ${b}`)
  }
  if (r.next_actions?.length) {
    lines.push('')
    lines.push('下一步：')
    for (const n of r.next_actions) lines.push(`- ${n}`)
  }
  return lines.join('\n')
}
