import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { createDefaultManagersForProject, getProjectManagers } from '@/services/managers'
import { audit } from '@/lib/audit'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { id: projectId } = await params

  // Ensure managers exist (lazy seed)
  const before = await getProjectManagers(supabase, user.id, projectId)
  let managers = before
  if (before.length === 0) {
    managers = await createDefaultManagersForProject(supabase, user.id, projectId)
    if (managers.length > 0) {
      await audit(supabase, user.id, 'manager.created', {
        resource_type: 'project', resource_id: projectId,
        metadata: { count: managers.length, lazy_seeded: true },
      })
    }
  }

  return Response.json(managers)
}
