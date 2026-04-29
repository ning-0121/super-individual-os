import { createClient } from '@/lib/supabase/server'
import { dispatch } from '@/lib/ai/dispatch-engine'
import type { Task, ExecutionUnit } from '@/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { task } = await req.json() as { task: Task }

  const { data: units } = await supabase
    .from('execution_units')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const result = dispatch(task, (units ?? []) as ExecutionUnit[])
  if (!result) return Response.json({ error: 'No active execution units' }, { status: 404 })

  return Response.json(result)
}
