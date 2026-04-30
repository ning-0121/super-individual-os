import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { reportError } from '@/lib/error-reporter'
import { apiError } from '@/lib/observability'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const { id } = await params
    const body = await req.json()
    const { error } = await supabase
      .from('tool_integrations').update(body).eq('id', id).eq('user_id', user.id)
    if (error) return apiError(error.message, { status: 400, code: 'db_error' })

    await audit(supabase, user.id, 'tool_integration.update', {
      resource_type: 'tool_integration', resource_id: id, metadata: { fields: Object.keys(body) },
    })
    return Response.json({ ok: true })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/tool-integrations/[id]', method: 'PATCH' })
    return apiError('Update failed', { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401, code: 'unauthorized' })

  try {
    const { id } = await params
    const { error } = await supabase.from('tool_integrations').delete().eq('id', id).eq('user_id', user.id)
    if (error) return apiError(error.message, { status: 400, code: 'db_error' })

    await audit(supabase, user.id, 'tool_integration.delete', {
      resource_type: 'tool_integration', resource_id: id,
    })
    return Response.json({ ok: true })
  } catch (e) {
    reportError(e, { user_id: user.id, endpoint: '/api/tool-integrations/[id]', method: 'DELETE' })
    return apiError('Delete failed', { status: 500 })
  }
}
