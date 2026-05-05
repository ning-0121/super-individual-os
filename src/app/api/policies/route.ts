import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { seedDefaultPolicies, loadPolicies } from '@/services/policies'
import { audit } from '@/lib/audit'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  await seedDefaultPolicies(supabase, user.id)
  const policies = await loadPolicies(supabase, user.id, projectId)
  return Response.json(policies)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json() as {
    project_id?: string | null
    scope?: 'global' | 'project' | 'manager'
    policy_name: string
    policy_type: 'auto_approve' | 'ai_manager' | 'human_required' | 'block'
    rule: Record<string, unknown>
    priority?: number
  }
  if (!body.policy_name || !body.policy_type || !body.rule) {
    return apiError('policy_name + policy_type + rule required', { status: 400 })
  }

  const { data, error } = await supabase.from('execution_policies').insert({
    user_id: user.id,
    project_id: body.project_id ?? null,
    scope: body.scope ?? (body.project_id ? 'project' : 'global'),
    policy_name: body.policy_name,
    policy_type: body.policy_type,
    rule: body.rule,
    priority: body.priority ?? 50,
    is_active: true,
  }).select().single()

  if (error) return apiError(error.message, { status: 400 })
  await audit(supabase, user.id, 'policy.created', {
    resource_type: 'execution_policy', resource_id: data.id,
    metadata: { policy_name: body.policy_name, policy_type: body.policy_type },
  })
  return Response.json(data, { status: 201 })
}
