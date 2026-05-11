import { SupabaseClient } from '@supabase/supabase-js'
import { buildPromptBlockForProject } from '@/services/project-context'

export type AIContext = {
  userSummary: string
  currentGoals: string[]
  activeProjects: string[]
  currentRisks: string[]
  recentDecisions: string[]
  executionStatus: string[]
  rawContextIds: {
    memories: string[]
    projects: string[]
    tasks: string[]
    conversations: string[]
  }
}

// ─── Scoring ────────────────────────────────────────────
function scoreRelevance(text: string, query: string): number {
  const words = query.toLowerCase().split(/[\s,，。？！?!、]+/).filter(w => w.length > 1)
  if (words.length === 0) return 0.5
  const lower = text.toLowerCase()
  const hits = words.filter(w => lower.includes(w)).length
  return hits / words.length
}

function scoreRecency(dateStr: string): number {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000
  return Math.max(0, 1 - days / 30)
}

function compositeScore(relevance: number, recency: number, importance: number): number {
  return relevance * 0.5 + recency * 0.3 + (importance / 5) * 0.2
}

// ─── Main ───────────────────────────────────────────────
export async function buildContext(
  supabase: SupabaseClient,
  userId: string,
  userInput: string,
  opts: { projectId?: string | null } = {},
): Promise<{ context: AIContext; prompt: string }> {

  // Fetch raw data
  const [
    { data: profile },
    { data: allMemories },
    { data: allProjects },
    { data: allTasks },
    { data: recentConvs },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', userId).single(),
    supabase.from('memories').select('*').eq('user_id', userId),
    supabase.from('projects').select('*').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('user_id', userId).not('status', 'in', '("done")'),
    supabase.from('conversations').select('id,title,mode,updated_at').eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(10),
  ])

  // ── Select Top Memories ──
  const scoredMemories = (allMemories ?? []).map(m => ({
    ...m,
    _score: compositeScore(
      scoreRelevance(m.content, userInput),
      scoreRecency(m.created_at),
      m.importance ?? 3
    ),
  })).sort((a, b) => b._score - a._score).slice(0, 5)

  // ── Select Top Projects ──
  const scoredProjects = (allProjects ?? []).map(p => ({
    ...p,
    _score: compositeScore(
      scoreRelevance(`${p.name} ${p.description} ${p.monthly_focus}`, userInput),
      scoreRecency(p.updated_at),
      p.status === 'active' ? 5 : p.status === 'maintain' ? 3 : 1
    ),
  })).sort((a, b) => b._score - a._score).slice(0, 3)

  // ── Select Top Tasks ──
  const scoredTasks = (allTasks ?? []).map(t => ({
    ...t,
    _score: compositeScore(
      scoreRelevance(`${t.title} ${t.description}`, userInput),
      scoreRecency(t.created_at),
      t.priority === 'must' ? 5 : t.priority === 'important' ? 3 : 1
    ),
  })).sort((a, b) => b._score - a._score).slice(0, 8)

  // ── Select Top Conversations ──
  const topConvs = (recentConvs ?? []).slice(0, 5)

  // ── Build AIContext ──
  const context: AIContext = {
    userSummary: profile
      ? `${profile.full_name || profile.email} | 目标: ${profile.goals || '未设置'} | 重点: ${profile.current_focus || '未设置'} | 风险偏好: ${profile.risk_preference}`
      : '用户信息未完善',

    currentGoals: [
      profile?.goals,
      profile?.current_focus,
      profile?.onboarding_goal,
    ].filter(Boolean) as string[],

    activeProjects: scoredProjects.map(p =>
      `[${p.status}] ${p.name}: ${p.description || '无描述'}${p.monthly_focus ? ` | 本月: ${p.monthly_focus}` : ''}`
    ),

    currentRisks: scoredMemories
      .filter(m => m.memory_type === 'risk' || m.memory_type === 'failure')
      .map(m => m.content),

    recentDecisions: scoredMemories
      .filter(m => m.memory_type === 'decision')
      .map(m => m.content),

    executionStatus: scoredTasks.map(t =>
      `[${t.priority}][${t.status}] ${t.title}`
    ),

    rawContextIds: {
      memories: scoredMemories.map(m => m.id),
      projects: scoredProjects.map(p => p.id),
      tasks: scoredTasks.map(t => t.id),
      conversations: topConvs.map(c => c.id),
    },
  }

  // ── Build Prompt String ──
  const lines = ['## 用户上下文（已智能筛选）', '']

  lines.push(`**用户摘要**：${context.userSummary}`)

  if (context.currentGoals.length > 0) {
    lines.push('\n**当前目标**：')
    context.currentGoals.forEach(g => lines.push(`- ${g}`))
  }

  if (context.activeProjects.length > 0) {
    lines.push('\n**活跃项目**：')
    context.activeProjects.forEach(p => lines.push(`- ${p}`))
  }

  if (context.executionStatus.length > 0) {
    lines.push('\n**执行状态（待完成任务）**：')
    context.executionStatus.forEach(t => lines.push(`- ${t}`))
  }

  if (context.recentDecisions.length > 0) {
    lines.push('\n**近期决策**：')
    context.recentDecisions.forEach(d => lines.push(`- ${d}`))
  }

  if (context.currentRisks.length > 0) {
    lines.push('\n**已知风险**：')
    context.currentRisks.forEach(r => lines.push(`- ${r}`))
  }

  const allMemoryContent = scoredMemories
    .filter(m => !['risk', 'failure', 'decision'].includes(m.memory_type))
    .map(m => `- [${m.memory_type}] ${m.content}`)
  if (allMemoryContent.length > 0) {
    lines.push('\n**AI 记忆（相关）**：')
    lines.push(...allMemoryContent)
  }

  if (topConvs.length > 0) {
    lines.push('\n**最近对话主题**：')
    topConvs.forEach(c => lines.push(`- ${c.title} (${c.mode})`))
  }

  // ── V2.5: Project Locked Context takes priority over user-global memory.
  // Prepend it so the model sees it first and treats it as immutable scope.
  let prompt = lines.join('\n')
  if (opts.projectId) {
    try {
      const projectBlock = await buildPromptBlockForProject(supabase, userId, opts.projectId)
      if (projectBlock) {
        prompt = projectBlock + '\n\n---\n\n' + prompt
      }
    } catch {
      // Best-effort — never fail the chat if context lookup errors.
    }
  }

  return { context, prompt }
}
