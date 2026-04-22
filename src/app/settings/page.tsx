'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/client'
import { getMemories } from '@/services/memories'
import { resetOnboarding } from '@/services/onboarding'
import { UserProfile, Memory } from '@/types'
import { useRouter } from 'next/navigation'

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
      setProfile(prof)
      setMemories(mems)
      setLoading(false)
    }
    load()
  }, [])

  async function handleResetOnboarding() {
    await resetOnboarding()
    router.push('/dashboard')
  }

  const memoryTypeLabel: Record<string, string> = {
    goal: '目标', personality: '性格', preference: '偏好',
    project: '项目', decision: '决策', risk: '风险', failure: '失败', success: '成功',
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-semibold text-white">设置</h1>

          {loading ? (
            <p className="text-gray-600 text-sm">加载中...</p>
          ) : (
            <>
              {/* Profile */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-400">用户档案</h3>
                {profile ? (
                  <div className="space-y-3">
                    {[
                      { label: '邮箱', value: profile.email },
                      { label: '当前目标', value: profile.goals || '未设置' },
                      { label: '当前重点', value: profile.current_focus || '未设置' },
                      { label: '风险偏好', value: profile.risk_preference },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between text-sm">
                        <span className="text-gray-500">{item.label}</span>
                        <span className="text-gray-200 max-w-xs text-right">{item.value}</span>
                      </div>
                    ))}
                    {profile.onboarding_goal && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">引导时选择的目标</span>
                        <span className="text-gray-200">{profile.onboarding_goal}</span>
                      </div>
                    )}
                    {profile.onboarding_pain && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">引导时选择的痛点</span>
                        <span className="text-gray-200">{profile.onboarding_pain}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">暂无档案</p>
                )}
              </div>

              {/* Memories */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-400">AI 记忆</h3>
                {memories.length === 0 ? (
                  <p className="text-gray-600 text-sm">暂无记忆数据</p>
                ) : (
                  <div className="space-y-2">
                    {memories.map(m => (
                      <div key={m.id} className="flex items-start gap-3 text-sm">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 shrink-0">
                          {memoryTypeLabel[m.memory_type] ?? m.memory_type}
                        </span>
                        <span className="text-gray-300">{m.content}</span>
                        <span className="text-gray-700 shrink-0 ml-auto">{'★'.repeat(m.importance)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reset Onboarding */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3">引导设置</h3>
                <p className="text-xs text-gray-600 mb-4">重新完成引导流程，更新你的目标和痛点，系统会重新生成个性化配置。</p>
                <button onClick={handleResetOnboarding}
                  className="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                  重新引导 →
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
