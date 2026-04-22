import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt, buildUserContext, AIMode } from '@/lib/claude'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { mode, userInput, conversationId, messageHistory = [] } = await req.json()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Build rich context from all user data
  const userContext = await buildUserContext(supabase, user.id)
  const systemPrompt = buildSystemPrompt(mode as AIMode, userContext)

  // Save user message
  if (conversationId) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userInput,
    })
  }

  // Build message history for context
  const messages = [
    ...messageHistory.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userInput },
  ]

  // Stream response
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()
  let fullContent = ''

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text
          fullContent += text
          controller.enqueue(encoder.encode(text))
        }
      }

      // Save assistant message
      if (conversationId && fullContent) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: fullContent,
        })
        await supabase.from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
      }

      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
