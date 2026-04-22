'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import OnboardingModal from '@/components/onboarding/OnboardingModal'
import { createClient } from '@/lib/supabase/client'
import { getOnboardingStatus, resetOnboarding } from '@/services/onboarding'
import { getProjects } from '@/services/projects'
import { getTasks } from '@/services/tasks'
import { UserProfile, Project, Task } from '@/types'

export default function DashboardPage() {
  const [profile, setProfile]             = useState<UserProfile | null>(null)
  const [projects, setProjects]           = useState<Project[]>([])
  const [tasks, setTasks]                 = useState<Task[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: prof }, completed, projs, tsks] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        getOnboardingStatus(),
        getProjects(),
        getTasks(),
      ])

      setProfile(prof)
      setProjects(projs)
      setTasks(tsks)
      setShowOnboarding(!completed)
      setLoading(false)
    }
    load()
  }, [])

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    window.location.reload()
  }

  const mustTasks  = tasks.filter(t => t.status !== 'done' && t.status !== 'paused' && t.priority === 'must')
  const todayTask  = mustTasks[0]
  const activeProjects = projects.filter(p => p.status === 'active')

  return (
    <div className="flex h-screen">
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}

      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-1">指挥台</h2>
              <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            </div>
            <button onClick={async () => { await resetOnboarding(); setShowOnboarding(true) }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              重新引导
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-600 text-sm">加载中...</div>
          ) : (
            <>
              {/* 今日唯一重点卡片 */}
              {profile?.current_focus && (
                <div className="bg-gradient-to-br from-blue-950/60 to-gray-900 border border-blue-900/50 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-blue-400 uppercase tracking-widest font-medium">今日唯一重点</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">当前目标</p>
                      <p className="text-white text-sm font-medium">{profile.current_focus}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">当前阶段</p>
                      <p className="text-gray-200 text-sm">{profile.goals || '早期验证期'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">今日最重要任务</p>
                      <p className="text-gray-200 text-sm">{todayTask?.title ?? '暂无任务，去创建'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">不应该做的事</p>
                      <p className="text-red-400 text-sm">开始任何新项目</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Must 任务 */}
              {mustTasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">🔴 必须完成</h3>
                  <div className="space-y-2">
                    {mustTasks.slice(0, 3).map(t => (
                      <div key={t.id} className="bg-gray-900 border border-gray-800 border-l-4 border-l-red-500 rounded-xl px-4 py-3 text-sm text-gray-200">
                        {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Projects */}
              {activeProjects.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">项目状态</h3>
                  <div className="space-y-3">
                    {activeProjects.map(p => (
                      <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start justify-between">
                        <div>
                          <div className="font-medium text-white mb-1">{p.name}</div>
                          {p.monthly_focus && <div className="text-sm text-gray-500">{p.monthly_focus}</div>}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded border bg-blue-900/40 text-blue-300 border-blue-800 shrink-0">
                          进行中
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!profile?.current_focus && projects.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-600 text-sm mb-3">还没有任何数据</p>
                  <button onClick={() => setShowOnboarding(true)}
                    className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
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
