/**
 * Legacy chat route — proxies to /api/ai/strategy so all engines run.
 * Kept for backward compatibility. Prefer calling /api/ai/strategy directly.
 */
import { POST as strategyPOST } from '@/app/api/ai/strategy/route'

export async function POST(req: Request) {
  const body = await req.json()
  const { messages = [], mode = 'ceo', conversationId } = body

  // Extract userInput + prior history from messages array
  const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const userInput = lastUser?.content ?? ''
  const messageHistory = messages.filter((m: { role: string; content: string }) => m !== lastUser)

  const proxyReq = new Request(req.url.replace('/api/chat', '/api/ai/strategy'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({ mode, userInput, conversationId, messageHistory }),
  })

  return strategyPOST(proxyReq)
}
