import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt, AIMode } from '@/lib/claude'
import { buildContext } from '@/lib/ai/context-engine'
import { runDecisionEngine } from '@/lib/ai/decision-engine'
import { logDecision, extractActionItems, getLearningInsights } from '@/lib/ai/learning-loop'

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
  const VALID_AI_MODES: AIMode[] = ['ceo', 'coo', 'growth']
  const effectiveMode: AIMode =
    VALID_AI_MODES.includes(signal.detectedMode as AIMode)
      ? (signal.detectedMode as AIMode)
      : VALID_AI_MODES.includes(mode as AIMode)
        ? (mode as AIMode)
        : 'ceo'

  // 3. Build enhanced system prompt, injecting learning insights
  const insights = await getLearningInsights(supabase, user.id)
  const learningBlock = insights.totalDecisions > 0
    ? `\n## 学习记录（你过去给出建议的统计）\n- 历史决策次数：${insights.totalDecisions}\n- 用户认可率：${insights.helpfulRate}%\n- 最常用模式：${insights.topMode.toUpperCase()}\n${insights.topRisk ? `- 用户高频风险：${insights.topRisk}（请在本次回答中特别关注）` : ''}\n- 待执行行动项：${insights.actionsPending} 个（避免给出太多新行动项，帮用户聚焦）\n`
    : ''
  const systemPrompt = buildSystemPrompt(effectiveMode, contextPrompt + learningBlock, signal)

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

  // 6. Pre-create decision log so we can return its ID in headers
  const decisionLogId = await logDecision(supabase, {
    userId: user.id,
    conversationId: conversationId ?? null,
    mode: effectiveMode,
    userInput,
    aiOutput: '', // will update after stream
    signal,
    context,
  })

  console.log('[DecisionEngine]', JSON.stringify({
    mode: effectiveMode,
    stage: signal.currentStage,
    risks: signal.riskFlags.map(r => r.code),
    decisionLogId,
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

      // 8. Update decision log with full AI output + re-extract action items
      if (decisionLogId && fullContent) {
        await supabase.from('decision_logs')
          .update({ ai_output: fullContent })
          .eq('id', decisionLogId)

        // Extract and insert execution items now that we have full content
        const actions = extractActionItems(fullContent)
        if (actions.length > 0) {
          // Remove placeholder empty inserts (logDecision inserted with empty aiOutput)
          await supabase.from('execution_logs').delete().eq('decision_log_id', decisionLogId)
          await supabase.from('execution_logs').insert(
            actions.map(a => ({
              user_id: user.id,
              decision_log_id: decisionLogId,
              action_item: a.item,
              timeframe: a.timeframe,
              status: 'pending',
            }))
          )
        }
      }

      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Decision-Signal': JSON.stringify(signal),
      'X-Effective-Mode': effectiveMode,
      'X-Decision-Log-Id': decisionLogId ?? '',
      'Access-Control-Expose-Headers': 'X-Decision-Signal, X-Effective-Mode, X-Decision-Log-Id',
    },
  })
}
