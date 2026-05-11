import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { appendActivity, getRecentActivity } from '@/services/project-context'
import type { ProjectActivityType } from '@/types'

const VALID: ProjectActivityType[] = [
  'decision','code_change','deployment','bug',
  'workflow_update','task_update','manager_report',
  'ai_summary','risk','approval','context_update',
]

// GET /api/projects/[id]/activity?limit=50
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const items = await getRecentActivity(supabase, user.id, id, limit)
  return Response.json({ items })
}

// POST /api/projects/[id]/activity — write a project event
// Body: { activity_type, title, summary?, metadata? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    activity_type?: ProjectActivityType
    title?: string
    summary?: string
    metadata?: Record<string, unknown>
  }
  if (!body.activity_type || !VALID.includes(body.activity_type))
    return apiError(`activity_type must be one of ${VALID.join(',')}`, { status: 400 })
  if (!body.title) return apiError('title required', { status: 400 })

  const out = await appendActivity(supabase, user.id, id, {
    activity_type: body.activity_type,
    title: body.title,
    summary: body.summary ?? '',
    metadata: body.metadata ?? {},
  })
  return Response.json(out)
}
