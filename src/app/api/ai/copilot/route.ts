import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { classifyIntent, type CopilotIntent } from '@/lib/ai/copilot-intent'

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
      let q = supabase.from('manager_reports')
        .select('id, role, summary, source, generated_at, system_id')
        .eq('user_id', userId).order('generated_at', { ascending: false }).limit(10)
      if (intent.role) q = q.eq('role', intent.role)
      const { data } = await q
      return { reports: data ?? [], requested_role: intent.role ?? null }
    }
    case 'help':
    case 'nav':
    case 'start_venture':
    case 'chat':
      return {}
  }
}
