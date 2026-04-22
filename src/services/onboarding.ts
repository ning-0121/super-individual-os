import { createClient } from '@/lib/supabase/client'

export interface OnboardingData {
  goal: string
  pain: string
}

export interface OnboardingResult {
  focus: string
  phase: string
  topTasks: string[]
  firstProject: string
  aiMode: string
  aiModeLabel: string
  stopDoing: string
}

export function generateResult(goal: string, pain: string): OnboardingResult {
  const goalMap: Record<string, { focus: string; project: string; phase: string }> = {
    '做副业赚钱':   { focus: '找到第一个付费客户',     project: '副业项目',   phase: '客户验证期' },
    '做自己的公司': { focus: '完成 MVP 并获得首批用户', project: '创业项目',   phase: 'MVP 验证期' },
    '提高收入':     { focus: '找到最高杠杆的收入来源', project: '收入增长计划', phase: '机会探索期' },
    '管理多个项目': { focus: '找到最值得押注的一个项目', project: '项目管理系统', phase: '聚焦决策期' },
    '做内容/IP':   { focus: '发布第一批内容，测试受众', project: '内容 IP 项目', phase: '内容验证期' },
    '做外贸/电商': { focus: '跑通第一个订单或产品线',  project: '外贸/电商项目', phase: '产品验证期' },
    '其他':         { focus: '明确最重要的一个目标',   project: '主项目',     phase: '早期探索期' },
  }

  const painMap: Record<string, { tasks: string[]; stop: string; mode: string; modeLabel: string }> = {
    '注意力分散':     { tasks: ['列出所有在做的事', '砍掉 50%', '只保留最重要的一个'],  stop: '开始任何新项目或新想法', mode: 'strategy',  modeLabel: '战略顾问' },
    '不知道做什么':   { tasks: ['用 AI 做战略判断', '明确 90 天目标', '拆解本周任务'],   stop: '同时评估多个方向',       mode: 'strategy',  modeLabel: '战略顾问' },
    '做很多但没有结果': { tasks: ['复盘过去一个月做了什么', '找出最有价值的动作', '停止低价值重复动作'], stop: '做没有验收标准的任务', mode: 'review', modeLabel: '复盘分析' },
    '缺少执行力':     { tasks: ['设定今日唯一任务', '用番茄钟专注 90 分钟', '当天复盘完成情况'], stop: '在执行时间内做计划',   mode: 'execution', modeLabel: '执行拆解' },
    '项目太多':       { tasks: ['列出所有项目', '用 Stop/Continue/Pivot 判断', '冻结 50% 项目'], stop: '启动新项目',          mode: 'strategy',  modeLabel: '战略顾问' },
    '不会销售和增长': { tasks: ['找到 10 个目标客户', '发出第一次客户开发信息', '收集反馈'],  stop: '在没有客户验证前继续开发产品', mode: 'execution', modeLabel: '执行拆解' },
    '其他':           { tasks: ['和 AI 对话描述你的情况', '找出最核心的问题', '制定 30 天目标'], stop: '同时解决多个问题',    mode: 'strategy',  modeLabel: '战略顾问' },
  }

  const g = goalMap[goal]  ?? goalMap['其他']
  const p = painMap[pain]  ?? painMap['其他']

  return {
    focus:        g.focus,
    phase:        g.phase,
    topTasks:     p.tasks,
    firstProject: g.project,
    aiMode:       p.mode,
    aiModeLabel:  p.modeLabel,
    stopDoing:    p.stop,
  }
}

export async function completeOnboarding(data: OnboardingData, result: OnboardingResult): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // 1. Update user profile
  await supabase.from('user_profiles').update({
    onboarding_completed: true,
    onboarding_goal:      data.goal,
    onboarding_pain:      data.pain,
    goals:                result.focus,
    current_focus:        result.focus,
    updated_at:           new Date().toISOString(),
  }).eq('id', user.id)

  // 2. Save memories
  const memories = [
    { memory_type: 'goal',        content: `用户目标：${data.goal}`,  importance: 5 },
    { memory_type: 'preference',  content: `最大痛点：${data.pain}`,  importance: 4 },
    { memory_type: 'decision',    content: `当前重点：${result.focus}`, importance: 5 },
  ]
  await supabase.from('memories').insert(
    memories.map(m => ({ ...m, user_id: user.id }))
  )

  // 3. Create first project
  await supabase.from('projects').insert({
    user_id:     user.id,
    name:        result.firstProject,
    description: `目标：${result.focus}`,
    status:      'active',
    priority:    'must',
    monthly_focus: result.topTasks[0],
  })

  // 4. Create initial tasks
  await supabase.from('tasks').insert(
    result.topTasks.map((title, i) => ({
      user_id:  user.id,
      title,
      status:   'todo',
      priority: i === 0 ? 'must' : 'important',
    }))
  )
}

export async function getOnboardingStatus(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return true

  const { data } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  return data?.onboarding_completed ?? false
}

export async function resetOnboarding(): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('user_profiles')
    .update({ onboarding_completed: false })
    .eq('id', user.id)
}
