import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt, AIMode } from '@/lib/claude'
import { buildContext } from '@/lib/ai/context-engine'
import { runDecisionEngine } from '@/lib/ai/decision-engine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { mode, userInput, conversationId, messageHistory = [] } = await req.json()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 1. Context Engine: smart context selection + scoring
  const { context, prompt: contextPrompt } = await buildContext(supabase, user.id, userInput)

  // 2. Decision Engine: rule-based risk + mode detection
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  const { data: allProjects } = await supabase.from('projects').select('id,status').eq('user_id', user.id)
  const { data: allTasks } = await supabase.from('tasks').select('id,priority,status').eq('user_id', user.id)
  const { data: memories } = await supabase.from('memories').select('content').eq('user_id', user.id)

  const activeProjectCount = (allProjects ?? []).filter(p => p.status === 'active').length
  const pendingTasks = (allTasks ?? []).filter(t => t.status !== 'done')
  const overdueTaskCount = pendingTasks.filter(t => t.priority === 'must').length

  const signal = runDecisionEngine({
    userInput,
    goals: profile?.goals,
    currentFocus: profile?.current_focus,
    onboardingPain: profile?.onboarding_pain,
    activeProjectCount,
    totalTaskCount: pendingTasks.length,
    overdueTaskCount,
    memoryContents: (memories ?? []).map(m => m.content),
  })

  // Override mode if Decision Engine detects a clearer signal
  const effectiveMode: AIMode = (signal.detectedMode !== 'general' ? signal.detectedMode : mode) as AIMode

  // 3. Build enhanced system prompt
  const systemPrompt = buildSystemPrompt(effectiveMode, contextPrompt, signal)

  // 4. Save user message
  if (conversationId) {
    await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content: userInput })
  }

  // 5. Call Claude with full context
  const messages = [
    ...messageHistory.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userInput },
  ]

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  })

  // 6. Log decision signal
  console.log('[DecisionEngine]', JSON.stringify({
    mode: effectiveMode,
    stage: signal.currentStage,
    risks: signal.riskFlags.map(r => r.code),
    contextIds: context.rawContextIds,
  }))

  const encoder = new TextEncoder()
  let fullContent = ''

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }

      // 7. Save assistant message
      if (conversationId && fullContent) {
        await supabase.from('messages').insert({
          conversation_id: conversationId, role: 'assistant', content: fullContent,
        })
        await supabase.from('conversations')
          .update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Decision-Signal': JSON.stringify(signal),
      'X-Effective-Mode': effectiveMode,
      'Access-Control-Expose-Headers': 'X-Decision-Signal, X-Effective-Mode',
    },
  })
}
