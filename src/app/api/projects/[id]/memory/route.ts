import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import type { MemoryType } from '@/types'

// GET project memories: project-scoped (project_id = id) UNION user-level (project_id IS NULL)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') ?? 'all'  // 'project' | 'user' | 'all'

  let query = supabase.from('memories').select('*').eq('user_id', user.id)
  if (scope === 'project')      query = query.eq('project_id', projectId)
  else if (scope === 'user')    query = query.is('project_id', null)
  else query = query.or(`project_id.eq.${projectId},project_id.is.null`)

  const { data, error } = await query.order('importance', { ascending: false })
  if (error) return apiError(error.message, { status: 400 })

  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params
  const body = await req.json() as {
    memory_type: MemoryType
    content: string
    importance?: number
    is_user_level?: boolean        // if true, project_id stays NULL
  }
  if (!body.content || !body.memory_type) return apiError('content + memory_type required', { status: 400 })

  const { data, error } = await supabase.from('memories').insert({
    user_id: user.id,
    project_id: body.is_user_level ? null : projectId,
    memory_type: body.memory_type,
    content: body.content,
    importance: body.importance ?? 3,
  }).select().single()

  if (error) return apiError(error.message, { status: 400 })
  return Response.json(data, { status: 201 })
}
