'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import OnboardingModal from '@/components/onboarding/OnboardingModal'
import { RiskBadge } from '@/components/ui/risk-badge'
import { createClient } from '@/lib/supabase/client'
import { getOnboardingStatus, resetOnboarding } from '@/services/onboarding'
import { getProjects } from '@/services/projects'
import { getTasks } from '@/services/tasks'
import { runDecisionEngine, DecisionSignal } from '@/lib/ai/decision-engine'
import { getMemories } from '@/services/memories'
import { UserProfile, Project, Task } from '@/types'
import { Target, Zap, AlertTriangle, Brain, ChevronRight } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  active:   'status-active',
  maintain: 'status-maintain',
  frozen:   'status-frozen',
  stopped:  'status-stopped',
}
const STATUS_LABEL: Record<string, string> = {
  active: '进行中', maintain: '维持', frozen: '已冻结', stopped: '已停止',
}

export default function DashboardPage() {
  const [profile, setProfile]               = useState<UserProfile | null>(null)
  const [projects, setProjects]             = useState<Project[]>([])
  const [tasks, setTasks]                   = useState<Task[]>([])
  const [signal, setSignal]                 = useState<DecisionSignal | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading]               = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: prof }, completed, projs, tsks, mems] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        getOnboardingStatus(),
        getProjects(),
        getTasks(),
        getMemories(),
      ])

      setProfile(prof)
      setProjects(projs)
      setTasks(tsks)
      setShowOnboarding(!completed)

      const sig = runDecisionEngine({
        userInput: '',
        goals: prof?.goals,
        currentFocus: prof?.current_focus,
        onboardingPain: prof?.onboarding_pain,
        activeProjectCount: projs.filter(p => p.status === 'active').length,
        totalTaskCount: tsks.filter(t => t.status !== 'done').length,
        overdueTaskCount: tsks.filter(t => t.status !== 'done' && t.priority === 'must').length,
        memoryContents: mems.map(m => m.content),
      })
      setSignal(sig)
      setLoading(false)
    }
    load()
  }, [])

  const mustTasks    = tasks.filter(t => t.status !== 'done' && t.priority === 'must')
  const todayTask    = mustTasks[0]
  const activeProjs  = projects.filter(p => p.status === 'active')
  const highRisks    = signal?.riskFlags.filter(r => r.severity === 'high') ?? []
  const allRisks     = signal?.riskFlags ?? []

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      {showOnboarding && <OnboardingModal onComplete={() => { setShowOnboarding(false); window.location.reload() }} />}
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono text-[var(--accent-light)] tracking-widest uppercase">Founder Command Center</span>
              {highRisks.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full risk-high border">
                  {highRisks.length} ALERT
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {profile?.current_focus || 'Super Individual OS'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)]">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <button onClick={async () => { await resetOnboarding(); setShowOnboarding(true) }}
              className="text-xs px-3 py-1.5 glass rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              重新引导
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 max-w-6xl">
          {loading ? (
            <div className="text-center py-20 text-[var(--text-muted)] text-sm">系统初始化中...</div>
          ) : (
            <>
              {/* 4-card grid */}
              <div className="grid grid-cols-4 gap-4">

                {/* Strategic Focus */}
                <div className="glass-strong rounded-xl p-5 col-span-1 glow-indigo">
                  <div className="flex items-center gap-2 mb-4">
                    <Target size={14} className="text-[var(--accent-light)]" />
                    <span className="text-xs font-semibold text-[var(--accent-light)] uppercase tracking-wider">Strategic Focus</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1">当前目标</p>
                      <p className="text-sm text-[var(--text-primary)] font-medium leading-snug">
                        {profile?.current_focus || '未设置目标'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1">当前阶段</p>
                      <p className="text-xs text-[var(--accent-light)]">{signal?.currentStage || '探索期'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1">活跃项目</p>
                      <p className="text-lg font-mono text-[var(--text-primary)]">{activeProjs.length}<span className="text-xs text-[var(--text-muted)] ml-1">个</span></p>
                    </div>
                  </div>
                </div>

                {/* Decision Radar */}
                <div className="glass rounded-xl p-5 col-span-1">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Decision Radar</span>
                  </div>
                  {allRisks.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">暂未检测到风险</p>
                  ) : (
                    <div className="space-y-2">
                      {allRisks.slice(0, 4).map(r => (
                        <div key={r.code} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border risk-${r.severity}`}>
                          <span>{r.severity === 'high' ? '⚠' : '◎'}</span>
                          <span className="font-medium">{r.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Execution Pulse */}
                <div className="glass rounded-xl p-5 col-span-1">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={14} className="text-[var(--cyan)]" />
                    <span className="text-xs font-semibold text-[var(--cyan)] uppercase tracking-wider">Execution Pulse</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1.5">
                        <span>任务完成率</span>
                        <span>{tasks.length > 0 ? Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100) : 0}%</span>
                      </div>
                      <div className="h-1 bg-[var(--bg-base)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--cyan)] rounded-full transition-all"
                          style={{ width: `${tasks.length > 0 ? tasks.filter(t => t.status === 'done').length / tasks.length * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1">今日最重要任务</p>
                      <p className="text-xs text-[var(--text-primary)] leading-snug">
                        {todayTask?.title || '暂无待办任务'}
                      </p>
                    </div>
                    <div className="flex gap-3 text-[10px] text-[var(--text-muted)]">
                      <span>待完成 <span className="text-[var(--text-primary)]">{tasks.filter(t => t.status !== 'done').length}</span></span>
                      <span>必须做 <span className="text-red-400">{mustTasks.length}</span></span>
                    </div>
                  </div>
                </div>

                {/* AI Co-founder Brief */}
                <div className="glass rounded-xl p-5 col-span-1">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain size={14} className="text-violet-400" />
                    <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Brief</span>
                  </div>
                  <div className="space-y-2">
                    {todayTask && (
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">今天该做</p>
                        <p className="text-xs text-[var(--text-primary)]">{todayTask.title}</p>
                      </div>
                    )}
                    {highRisks[0] && (
                      <div>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">需要关注</p>
                        <p className="text-xs text-amber-400">{highRisks[0].label}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1">不应该做</p>
                      <p className="text-xs text-red-400">开始任何新项目或新方向</p>
                    </div>
                    <a href="/chat" className="flex items-center gap-1 text-[10px] text-[var(--accent-light)] hover:text-white transition-colors mt-2">
                      和 AI 对话 <ChevronRight size={10} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Risk detail */}
              {allRisks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">风险详情</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {allRisks.map(r => <RiskBadge key={r.code} risk={r} />)}
                  </div>
                </div>
              )}

              {/* Active Projects */}
              {activeProjs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">活跃项目</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {activeProjs.map(p => (
                      <div key={p.id} className="glass glass-hover rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[p.status]}`}>
                            {STATUS_LABEL[p.status]}
                          </span>
                        </div>
                        {p.monthly_focus && <p className="text-xs text-[var(--text-secondary)]">{p.monthly_focus}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty */}
              {!profile?.current_focus && projects.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-[var(--text-muted)] text-sm mb-4">系统尚未初始化</p>
                  <button onClick={() => setShowOnboarding(true)}
                    className="text-[var(--accent-light)] text-sm hover:text-white transition-colors">
                    开始引导设置 →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
