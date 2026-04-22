import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/claude/system-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { messages, mode, conversationId } = await req.json()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const systemPrompt = buildSystemPrompt(mode, profile)

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let fullContent = ''
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text
          fullContent += text
          controller.enqueue(encoder.encode(text))
        }
      }

      // Save assistant message to DB
      if (conversationId && fullContent) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: fullContent,
        })
      }

      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
