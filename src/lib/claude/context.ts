import { SupabaseClient } from '@supabase/supabase-js'

export async function buildUserContext(supabase: SupabaseClient, userId: string): Promise<string> {
  const [
    { data: profile },
    { data: memories },
    { data: projects },
    { data: tasks },
    { data: recentConversations },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', userId).single(),
    supabase.from('memories').select('*').eq('user_id', userId)
      .order('importance', { ascending: false }).limit(5),
    supabase.from('projects').select('*').eq('user_id', userId)
      .in('status', ['active', 'maintain']).limit(5),
    supabase.from('tasks').select('*').eq('user_id', userId)
      .not('status', 'in', '("done","paused")').limit(10),
    supabase.from('conversations').select('id, title, mode, updated_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(5),
  ])

  const lines: string[] = ['## 用户上下文']

  // Profile
  if (profile) {
    lines.push(`
### 用户基本信息
- 长期目标：${profile.goals || '未设置'}
- 当前重点：${profile.current_focus || '未设置'}
- 风险偏好：${profile.risk_preference || '稳健'}
- 最大痛点：${profile.onboarding_pain || '未知'}
- 核心目标方向：${profile.onboarding_goal || '未知'}`)
  }

  // Projects
  if (projects && projects.length > 0) {
    lines.push(`\n### 当前项目（${projects.length} 个）`)
    projects.forEach(p => {
      lines.push(`- 【${p.status === 'active' ? '进行中' : '维持'}】${p.name}：${p.description || '无描述'}`)
      if (p.monthly_focus) lines.push(`  本月重点：${p.monthly_focus}`)
    })
  } else {
    lines.push('\n### 当前项目\n- 暂无项目')
  }

  // Tasks
  if (tasks && tasks.length > 0) {
    const must = tasks.filter(t => t.priority === 'must')
    const others = tasks.filter(t => t.priority !== 'must')
    lines.push(`\n### 当前待办任务（${tasks.length} 个）`)
    if (must.length > 0) {
      lines.push('**必须完成：**')
      must.forEach(t => lines.push(`- ${t.title}`))
    }
    if (others.length > 0) {
      lines.push('**其他任务：**')
      others.slice(0, 5).forEach(t => lines.push(`- ${t.title}`))
    }
  } else {
    lines.push('\n### 当前待办任务\n- 暂无任务')
  }

  // Memories
  if (memories && memories.length > 0) {
    lines.push('\n### AI 记忆（重要历史信息）')
    memories.forEach(m => {
      lines.push(`- [${m.memory_type}] ${m.content}`)
    })
  }

  // Recent conversations
  if (recentConversations && recentConversations.length > 0) {
    lines.push('\n### 最近对话主题')
    recentConversations.forEach(c => {
      lines.push(`- ${c.title}（${c.mode} 模式）`)
    })
  }

  return lines.join('\n')
}
