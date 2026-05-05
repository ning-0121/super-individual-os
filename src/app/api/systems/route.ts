import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const [{ data: systems }, { data: links }] = await Promise.all([
    supabase.from('systems').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('system_projects').select('*').eq('user_id', user.id),
  ])

  return Response.json({
    systems: systems ?? [],
    links: links ?? [],
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json() as {
    name: string; description?: string;
    project_ids?: string[];
    metadata?: Record<string, unknown>
  }
  if (!body.name) return apiError('name required', { status: 400 })

  const { data, error } = await supabase.from('systems').insert({
    user_id: user.id,
    name: body.name,
    description: body.description ?? '',
    status: 'active',
    metadata: body.metadata ?? {},
  }).select().single()

  if (error || !data) return apiError(error?.message ?? 'Insert failed', { status: 400 })

  await audit(supabase, user.id, 'system.created', {
    resource_type: 'system', resource_id: data.id,
    metadata: { name: body.name },
  })

  // Link projects if provided
  if (body.project_ids && body.project_ids.length > 0) {
    const links = body.project_ids.map(pid => ({
      user_id: user.id, system_id: data.id, project_id: pid, role: 'member',
    }))
    await supabase.from('system_projects').insert(links)
    await audit(supabase, user.id, 'system.linked_project', {
      resource_type: 'system', resource_id: data.id,
      metadata: { project_count: body.project_ids.length },
    })
  }

  return Response.json(data, { status: 201 })
}
