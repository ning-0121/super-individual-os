import { createClient } from '@/lib/supabase/server'
import { recordOutcome, type Feedback } from '@/lib/ai/learning-loop'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { decisionLogId, feedback, note } = await req.json() as {
    decisionLogId: string
    feedback: Feedback
    note?: string
  }

  if (!decisionLogId || !feedback) {
    return new Response('Missing fields', { status: 400 })
  }

  await recordOutcome(supabase, {
    userId: user.id,
    decisionLogId,
    feedback,
    note,
  })

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
