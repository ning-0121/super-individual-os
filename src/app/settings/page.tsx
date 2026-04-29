'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/client'
import { getMemories } from '@/services/memories'
import { resetOnboarding } from '@/services/onboarding'
import { UserProfile, Memory } from '@/types'
import { useRouter } from 'next/navigation'
import { Brain, Target, AlertTriangle, TrendingUp, XCircle, RotateCcw } from 'lucide-react'

const MEMORY_META: Record<string, { icon: string; color: string }> = {
  goal:        { icon: '◎', color: 'text-[var(--accent-light)]' },
  personality: { icon: '◉', color: 'text-violet-400' },
  preference:  { icon: '◈', color: 'text-cyan-400' },
  project:     { icon: '▣', color: 'text-emerald-400' },
  decision:    { icon: '⬡', color: 'text-amber-400' },
  risk:        { icon: '⚠', color: 'text-red-400' },
  failure:     { icon: '✕', color: 'text-red-500' },
  success:     { icon: '✓', color: 'text-emerald-400' },
}

export default function SettingsPage() {
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading]   = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: prof }, mems] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        getMemories(),
      ])
      setProfile(prof); setMemories(mems); setLoading(false)
    }
    load()
  }, [])

  async function handleReset() {
    await resetOnboarding()
    router.push('/dashboard')
  }

  const memGroups = {
    goal:     memories.filter(m => m.memory_type === 'goal'),
    decision: memories.filter(m => m.memory_type === 'decision'),
    success:  memories.filter(m => m.memory_type === 'success'),
    failure:  memories.filter(m => m.memory_type === 'failure'),
    risk:     memories.filter(m => m.memory_type === 'risk'),
    other:    memories.filter(m => !['goal','decision','success','failure','risk'].includes(m.memory_type)),
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-[var(--border)] px-8 py-4 glass">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Second Brain</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>知识与记忆系统</h1>
        </div>

        <div className="p-8 max-w-4xl">
          {loading ? (
            <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>
          ) : (
            <div className="space-y-6">
              {/* Profile */}
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={14} className="text-[var(--accent-light)]" />
                  <h3 className="text-sm font-semibold text-[var(--accent-light)] uppercase tracking-wider">User Profile</h3>
                </div>
                {profile ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: '邮箱', value: profile.email },
                      { label: '风险偏好', value: profile.risk_preference },
                      { label: '当前目标', value: profile.goals || '未设置' },
                      { label: '当前重点', value: profile.current_focus || '未设置' },
                      { label: '选择的目标方向', value: profile.onboarding_goal || '未完成引导' },
                      { label: '最大痛点', value: profile.onboarding_pain || '未完成引导' },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)] text-sm">暂无档案</p>
                )}
              </div>

              {/* Memory sections */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'goal', label: 'Goals', icon: <Target size={12} />, color: 'text-[var(--accent-light)]' },
                  { key: 'decision', label: 'Decision History', icon: <Brain size={12} />, color: 'text-amber-400' },
                  { key: 'success', label: 'Success Patterns', icon: <TrendingUp size={12} />, color: 'text-emerald-400' },
                  { key: 'failure', label: 'Failure Patterns', icon: <XCircle size={12} />, color: 'text-red-400' },
                  { key: 'risk', label: 'Risk Flags', icon: <AlertTriangle size={12} />, color: 'text-amber-400' },
                  { key: 'other', label: 'Other Memories', icon: <Brain size={12} />, color: 'text-violet-400' },
                ].map(section => {
                  const items = memGroups[section.key as keyof typeof memGroups]
                  return (
                    <div key={section.key} className="glass rounded-xl p-4">
                      <div className={`flex items-center gap-1.5 mb-3 ${section.color}`}>
                        {section.icon}
                        <h4 className="text-xs font-semibold uppercase tracking-wider">{section.label}</h4>
                        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{items.length}</span>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>暂无记录</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map(m => {
                            const meta = MEMORY_META[m.memory_type]
                            return (
                              <div key={m.id} className="flex items-start gap-2 text-xs">
                                <span className={`shrink-0 ${meta?.color}`}>{meta?.icon}</span>
                                <p style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
                                <div className="flex shrink-0">
                                  {Array.from({ length: m.importance }).map((_, i) => (
                                    <span key={i} className="text-amber-400" style={{ fontSize: '8px' }}>★</span>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Reset */}
              <div className="glass rounded-xl p-5 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>重新引导</h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>重新完成引导流程，更新目标和痛点，系统重新生成个性化配置</p>
                </div>
                <button onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg transition-colors"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <RotateCcw size={12} /> 重新引导
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
