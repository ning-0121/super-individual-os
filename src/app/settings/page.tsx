'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/client'
import { getMemories, saveMemory, updateMemory, deleteMemory } from '@/services/memories'
import { resetOnboarding } from '@/services/onboarding'
import { UserProfile, Memory, MemoryType } from '@/types'
import { useRouter } from 'next/navigation'
import { Brain, Target, AlertTriangle, TrendingUp, XCircle, RotateCcw, Edit2, Check, X, Plus, Trash2 } from 'lucide-react'
import ModelSettings from '@/components/ai/ModelSettings'

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

const RISK_PREF_OPTIONS = ['激进', '平衡', '稳健', '保守']

export default function SettingsPage() {
  const [profile, setProfile]     = useState<UserProfile | null>(null)
  const [memories, setMemories]   = useState<Memory[]>([])
  const [loading, setLoading]     = useState(true)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileDraft, setProfileDraft]     = useState<Partial<UserProfile>>({})
  const [savingProfile, setSavingProfile]   = useState(false)
  const [editingMemId, setEditingMemId]     = useState<string | null>(null)
  const [editingMemContent, setEditingMemContent] = useState('')
  const [addingMem, setAddingMem]   = useState(false)
  const [newMemContent, setNewMemContent] = useState('')
  const [newMemType, setNewMemType]       = useState<MemoryType>('goal')
  const [newMemImportance, setNewMemImportance] = useState(3)
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
      if (prof) setProfileDraft({
        goals: prof.goals, current_focus: prof.current_focus,
        risk_preference: prof.risk_preference, full_name: prof.full_name,
      })
    }
    load()
  }, [])

  async function handleReset() { await resetOnboarding(); router.push('/dashboard') }

  async function saveProfile() {
    if (!profile) return
    setSavingProfile(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update(profileDraft).eq('id', user.id)
      setProfile(prev => prev ? { ...prev, ...profileDraft } : null)
    }
    setSavingProfile(false); setEditingProfile(false)
  }

  async function handleAddMemory() {
    if (!newMemContent.trim()) return
    const mem = await saveMemory({ memory_type: newMemType, content: newMemContent.trim(), importance: newMemImportance })
    setMemories(prev => [mem, ...prev])
    setNewMemContent(''); setAddingMem(false)
  }

  async function handleEditMemory(id: string) {
    await updateMemory(id, { content: editingMemContent })
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editingMemContent } : m))
    setEditingMemId(null)
  }

  async function handleDeleteMemory(id: string) {
    await deleteMemory(id)
    setMemories(prev => prev.filter(m => m.id !== id))
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
        <div className="border-b border-[var(--border)] px-8 py-4 glass flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Second Brain</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>知识与记忆系统</h1>
          </div>
          <button onClick={() => setAddingMem(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 添加记忆
          </button>
        </div>

        <div className="p-8 max-w-4xl">
          {loading ? (
            <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>
          ) : (
            <div className="space-y-6">

              {/* Add Memory Modal */}
              {addingMem && (
                <div className="glass-strong rounded-xl p-5 border border-[var(--border-strong)]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>添加记忆</h3>
                    <button onClick={() => setAddingMem(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                  </div>
                  <div className="space-y-3">
                    {/* Type */}
                    <div>
                      <p className="text-[10px] text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">类型</p>
                      <div className="flex flex-wrap gap-2">
                        {(['goal','decision','success','failure','risk','preference','personality'] as MemoryType[]).map(t => (
                          <button key={t} onClick={() => setNewMemType(t)}
                            className="text-[10px] px-2 py-1 rounded transition-all"
                            style={{
                              border: `1px solid ${newMemType === t ? 'var(--accent)' : 'var(--border)'}`,
                              background: newMemType === t ? 'rgba(99,102,241,0.2)' : 'transparent',
                              color: newMemType === t ? 'var(--accent-light)' : 'var(--text-muted)',
                            }}>
                            {MEMORY_META[t]?.icon} {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Content */}
                    <textarea value={newMemContent} onChange={e => setNewMemContent(e.target.value)}
                      placeholder="记录这条记忆的内容..."
                      rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                    {/* Importance */}
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">重要度</p>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setNewMemImportance(n)}
                            className="text-sm transition-colors"
                            style={{ color: n <= newMemImportance ? '#f59e0b' : 'var(--border-strong)' }}>★</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAddMemory}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white"
                        style={{ background: 'var(--accent)' }}>
                        <Check size={13} /> 保存
                      </button>
                      <button onClick={() => setAddingMem(false)}
                        className="px-4 py-2 rounded-lg text-sm"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Profile */}
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={14} className="text-[var(--accent-light)]" />
                  <h3 className="text-sm font-semibold text-[var(--accent-light)] uppercase tracking-wider">User Profile</h3>
                  <button onClick={() => editingProfile ? saveProfile() : setEditingProfile(true)}
                    disabled={savingProfile}
                    className="ml-auto flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    {editingProfile ? <><Check size={10} /> {savingProfile ? '保存中...' : '保存'}</> : <><Edit2 size={10} /> 编辑</>}
                  </button>
                  {editingProfile && (
                    <button onClick={() => setEditingProfile(false)}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <X size={10} /> 取消
                    </button>
                  )}
                </div>
                {profile ? (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Read-only fields */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>邮箱</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.email}</p>
                    </div>
                    {/* Editable: risk_preference */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>风险偏好</p>
                      {editingProfile ? (
                        <div className="flex gap-2 flex-wrap">
                          {RISK_PREF_OPTIONS.map(r => (
                            <button key={r} onClick={() => setProfileDraft(d => ({ ...d, risk_preference: r }))}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{
                                border: `1px solid ${profileDraft.risk_preference === r ? 'var(--accent)' : 'var(--border)'}`,
                                background: profileDraft.risk_preference === r ? 'rgba(99,102,241,0.15)' : 'transparent',
                                color: profileDraft.risk_preference === r ? 'var(--accent-light)' : 'var(--text-muted)',
                              }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.risk_preference || '未设置'}</p>
                      )}
                    </div>
                    {/* Editable: goals */}
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>长期目标</p>
                      {editingProfile ? (
                        <textarea value={profileDraft.goals ?? ''} onChange={e => setProfileDraft(d => ({ ...d, goals: e.target.value }))}
                          rows={2} className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.goals || '未设置'}</p>
                      )}
                    </div>
                    {/* Editable: current_focus */}
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>当前重点</p>
                      {editingProfile ? (
                        <input value={profileDraft.current_focus ?? ''} onChange={e => setProfileDraft(d => ({ ...d, current_focus: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.current_focus || '未设置'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>选择的目标方向</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.onboarding_goal || '未完成引导'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>最大痛点</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.onboarding_pain || '未完成引导'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)] text-sm">暂无档案</p>
                )}
              </div>

              {/* Memory sections */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'goal',     label: 'Goals',            icon: <Target size={12} />,       color: 'text-[var(--accent-light)]' },
                  { key: 'decision', label: 'Decision History', icon: <Brain size={12} />,         color: 'text-amber-400' },
                  { key: 'success',  label: 'Success Patterns', icon: <TrendingUp size={12} />,   color: 'text-emerald-400' },
                  { key: 'failure',  label: 'Failure Patterns', icon: <XCircle size={12} />,      color: 'text-red-400' },
                  { key: 'risk',     label: 'Risk Flags',       icon: <AlertTriangle size={12} />, color: 'text-amber-400' },
                  { key: 'other',    label: 'Other Memories',   icon: <Brain size={12} />,         color: 'text-violet-400' },
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
                            const isEditing = editingMemId === m.id
                            return (
                              <div key={m.id} className="group">
                                {isEditing ? (
                                  <div className="flex gap-2">
                                    <input autoFocus value={editingMemContent}
                                      onChange={e => setEditingMemContent(e.target.value)}
                                      className="flex-1 rounded px-2 py-1 text-xs focus:outline-none"
                                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                                    <button onClick={() => handleEditMemory(m.id)}
                                      className="text-emerald-400"><Check size={11} /></button>
                                    <button onClick={() => setEditingMemId(null)}
                                      style={{ color: 'var(--text-muted)' }}><X size={11} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className={`shrink-0 ${meta?.color}`}>{meta?.icon}</span>
                                    <p className="flex-1" style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
                                    <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {Array.from({ length: m.importance }).map((_, i) => (
                                        <span key={i} className="text-amber-400" style={{ fontSize: '8px' }}>★</span>
                                      ))}
                                      <button onClick={() => { setEditingMemId(m.id); setEditingMemContent(m.content) }}
                                        className="ml-1" style={{ color: 'var(--text-muted)' }}>
                                        <Edit2 size={9} />
                                      </button>
                                      <button onClick={() => handleDeleteMemory(m.id)}
                                        className="hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }}>
                                        <Trash2 size={9} />
                                      </button>
                                    </div>
                                  </div>
                                )}
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

          {/* V2.6 — AI Gateway / Model Settings */}
          <div className="px-6 py-6 max-w-4xl">
            <ModelSettings />
          </div>
        </div>
      </main>
    </div>
  )
}
