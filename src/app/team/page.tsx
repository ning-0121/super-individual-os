'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ExecutionUnit, ExecutionUnitType, Capability } from '@/types'
import { getExecutionUnits, createExecutionUnit, updateExecutionUnit, deleteExecutionUnit } from '@/services/execution-units'
import { Plus, Bot, User, Cpu, Trash2, Edit2, X, Check } from 'lucide-react'

import { Wrench } from 'lucide-react'

const TYPE_META: Record<ExecutionUnitType, { label: string; color: string; icon: React.FC<{ size?: number; className?: string }> }> = {
  human: { label: '人工',   color: 'text-cyan-400',    icon: User },
  ai:    { label: 'AI 助手', color: 'text-violet-400',  icon: Bot },
  agent: { label: 'AI 智能体', color: 'text-emerald-400', icon: Cpu },
  tool:  { label: '工具',   color: 'text-orange-400',  icon: Wrench },
}

const ALL_CAPS: { value: Capability; label: string }[] = [
  { value: 'writing',  label: '写作' },
  { value: 'coding',   label: '开发' },
  { value: 'research', label: '调研' },
  { value: 'strategy', label: '战略' },
  { value: 'ops',      label: '运营' },
  { value: 'outreach', label: '外联' },
  { value: 'design',   label: '设计' },
  { value: 'analysis', label: '数据分析' },
]

const AVATARS = ['👤','🤖','⚡','🧠','📝','🔧','🎯','🚀','🦾','💡','🗂️','📊']

const STYLE_PRESETS: { label: string; prompt: string }[] = [
  { label: '执行教练', prompt: '你是一个高效执行教练。回答简洁、直接，聚焦可执行的下一步，不废话。' },
  { label: '创意顾问', prompt: '你是一个创意顾问。善于发散思维，提供新颖角度，喜欢用类比和故事。' },
  { label: '数据分析师', prompt: '你是一个严谨的数据分析师。每个结论都要有数据支撑，重视逻辑和量化。' },
  { label: '增长黑客', prompt: '你是一个增长黑客。聚焦北极星指标，善于低成本实验，追求可复制的增长。' },
  { label: '风险官', prompt: '你是一个首席风险官。思考每个决策的潜在风险，提前识别问题，保守但精准。' },
]

type FormState = {
  type: ExecutionUnitType
  name: string
  avatar: string
  description: string
  capabilities: Capability[]
  style_prompt: string
}

const DEFAULT_FORM: FormState = {
  type: 'agent', name: '', avatar: '🤖',
  description: '', capabilities: [], style_prompt: '',
}

export default function TeamPage() {
  const [units, setUnits]       = useState<ExecutionUnit[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    getExecutionUnits().then(setUnits).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditId(null); setForm(DEFAULT_FORM); setShowForm(true)
  }

  function openEdit(u: ExecutionUnit) {
    setEditId(u.id)
    setForm({
      type: u.type, name: u.name, avatar: u.avatar,
      description: u.description,
      capabilities: u.capabilities as Capability[],
      style_prompt: u.style_prompt,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editId) {
      await updateExecutionUnit(editId, form)
      setUnits(prev => prev.map(u => u.id === editId ? { ...u, ...form } : u))
    } else {
      const created = await createExecutionUnit(form)
      setUnits(prev => [...prev, created])
    }
    setSaving(false); setShowForm(false)
  }

  async function remove(id: string) {
    await deleteExecutionUnit(id)
    setUnits(prev => prev.filter(u => u.id !== id))
  }

  function toggleCap(cap: Capability) {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap],
    }))
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        {/* Header */}
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Execution OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>执行单元</h1>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 新建 Agent
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading && <p className="text-center py-16 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && (
            <div className="max-w-4xl space-y-6">

              {/* Units grid */}
              <div className="grid grid-cols-3 gap-4">
                {units.map(u => {
                  const meta = TYPE_META[u.type]
                  const Icon = meta.icon
                  return (
                    <div key={u.id} className="glass rounded-xl p-5 group relative">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{u.avatar}</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Icon size={10} className={meta.color} />
                              <span className={`text-[10px] ${meta.color}`}>{meta.label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(u)}
                            className="p-1 rounded hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--text-muted)' }}>
                            <Edit2 size={12} />
                          </button>
                          {u.type !== 'human' && (
                            <button onClick={() => remove(u.id)}
                              className="p-1 rounded hover:bg-red-900/20 transition-colors text-red-400">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {u.description && (
                        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{u.description}</p>
                      )}

                      {/* Capabilities */}
                      {u.capabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(u.capabilities as Capability[]).map(cap => {
                            const capLabel = ALL_CAPS.find(c => c.value === cap)?.label ?? cap
                            return (
                              <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                {capLabel}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {u.type === 'agent' && u.style_prompt && (
                        <p className="text-[9px] mt-2 italic line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                          &ldquo;{u.style_prompt}&rdquo;
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* Empty state */}
                {units.length === 0 && (
                  <div className="col-span-3 text-center py-16">
                    <p className="text-[var(--text-muted)] text-sm mb-4">还没有执行单元</p>
                    <button onClick={openCreate} className="text-[var(--accent-light)] text-sm hover:text-white transition-colors">
                      创建第一个 Agent →
                    </button>
                  </div>
                )}
              </div>

              {/* Dispatch logic explanation */}
              <div className="glass rounded-xl p-5">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Dispatch Engine 规则</p>
                <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="space-y-1.5">
                    <p>⚡ <span className="text-red-400">必须</span> 优先级 → 人工执行</p>
                    <p>🤝 含「会议/谈判/客户」→ 人工执行</p>
                    <p>✍️ 含写作/文案关键词 → 写作 Agent</p>
                    <p>💻 含开发/代码关键词 → 开发 Agent</p>
                  </div>
                  <div className="space-y-1.5">
                    <p>🔍 含调研/分析关键词 → 调研 Agent</p>
                    <p>📣 含推广/外联关键词 → 外联 Agent</p>
                    <p>🟡 <span className="text-[var(--text-muted)]">可选</span> 优先级 → 优先 AI 执行</p>
                    <p>🔄 无匹配 → 按能力评分排序</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Slide-in form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto" style={{ border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editId ? '编辑执行单元' : '新建执行单元'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">类型</label>
                <div className="flex gap-2">
                  {(['human', 'ai', 'agent'] as ExecutionUnitType[]).map(t => {
                    const m = TYPE_META[t]
                    const Icon = m.icon
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all"
                        style={{
                          border: `1px solid ${form.type === t ? 'var(--border-strong)' : 'var(--border)'}`,
                          background: form.type === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                          color: form.type === t ? 'var(--accent-light)' : 'var(--text-muted)',
                        }}>
                        <Icon size={11} /> {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Avatar picker */}
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">头像</label>
                <div className="flex flex-wrap gap-2">
                  {AVATARS.map(a => (
                    <button key={a} onClick={() => setForm(f => ({ ...f, avatar: a }))}
                      className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all"
                      style={{ border: `1px solid ${form.avatar === a ? 'var(--accent)' : 'var(--border)'}`, background: form.avatar === a ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">名称</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：内容写手、增长分析师..."
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">描述（选填）</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="负责什么类型的任务..."
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {/* Capabilities */}
              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">能力标签</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_CAPS.map(cap => {
                    const active = form.capabilities.includes(cap.value)
                    return (
                      <button key={cap.value} onClick={() => toggleCap(cap.value)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-all"
                        style={{
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                          color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                        }}>
                        {cap.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Style prompt (agent only) */}
              {(form.type === 'agent' || form.type === 'ai') && (
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 block">风格 Prompt</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {STYLE_PRESETS.map(p => (
                      <button key={p.label} onClick={() => setForm(f => ({ ...f, style_prompt: p.prompt }))}
                        className="text-[10px] px-2 py-1 rounded transition-all"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: form.style_prompt === p.prompt ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={form.style_prompt} onChange={e => setForm(f => ({ ...f, style_prompt: e.target.value }))}
                    placeholder="输入 Agent 的系统提示词（会注入到 Claude 的 system prompt）..."
                    rows={3}
                    className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving || !form.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <Check size={14} /> {saving ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
