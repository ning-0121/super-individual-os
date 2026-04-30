'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ExecutionUnit, AgentType, Capability } from '@/types'
import { AGENT_TYPE_META } from '@/services/agents'
import { Plus, Edit2, Power, X, Check, Bot, User, Cpu, Wrench, Zap } from 'lucide-react'

const UNIT_TYPE_ICON: Record<string, React.FC<{ size?: number; className?: string }>> = {
  human: User, ai: Bot, agent: Cpu, tool: Wrench,
}

const ALL_CAPS: { value: Capability; label: string }[] = [
  { value: 'writing',  label: '写作' }, { value: 'coding',   label: '开发' },
  { value: 'research', label: '调研' }, { value: 'strategy', label: '战略' },
  { value: 'ops',      label: '运营' }, { value: 'outreach', label: '外联' },
  { value: 'design',   label: '设计' }, { value: 'analysis', label: '数据' },
]

const WORKFLOW_LABELS: Record<string, string> = {
  draft: '草稿', planned: '已规划', assigned: '已分配', running: '执行中',
  blocked: '阻塞', submitted: '已提交', under_review: '审核中',
  revision_required: '需返工', approved: '已审批', completed: '已完成', archived: '已归档',
}

type FormState = {
  type: 'human' | 'ai' | 'agent' | 'tool'
  agent_type: AgentType
  name: string
  avatar: string
  description: string
  capabilities: Capability[]
  style_prompt: string
  system_prompt: string
  tools_allowed: string[]
}

const AVATARS = ['🤖','⚡','🧠','📝','🔧','🎯','🚀','🦾','💡','📊','💻','🔍','📈','💰','🎨','✅','👤','🗂️']
const TOOL_OPTIONS = ['github','vercel','supabase','figma','notion','slack','gmail','cursor','claude_api']

const DEFAULT_FORM: FormState = {
  type: 'agent', agent_type: 'general', name: '', avatar: '🤖',
  description: '', capabilities: [], style_prompt: '', system_prompt: '', tools_allowed: [],
}

export default function AgentsPage() {
  const [agents, setAgents]     = useState<ExecutionUnit[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]     = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | AgentType>('all')

  useEffect(() => {
    fetch('/api/agents').then(r => r.json())
      .then(d => { setAgents(Array.isArray(d) ? d : []) })
      .finally(() => setLoading(false))
  }, [])

  const displayed = activeTab === 'all' ? agents : agents.filter(a => a.agent_type === activeTab)

  function openCreate() { setEditId(null); setForm(DEFAULT_FORM); setShowForm(true) }
  function openEdit(u: ExecutionUnit) {
    setEditId(u.id)
    setForm({
      type: u.type as FormState['type'],
      agent_type: u.agent_type ?? 'general',
      name: u.name, avatar: u.avatar, description: u.description,
      capabilities: (u.capabilities ?? []) as Capability[],
      style_prompt: u.style_prompt ?? '',
      system_prompt: u.system_prompt ?? '',
      tools_allowed: (u.tools_allowed ?? []) as string[],
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editId) {
      await fetch(`/api/agents/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      setAgents(prev => prev.map(a => a.id === editId ? { ...a, ...form } : a))
    } else {
      const res = await fetch('/api/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const created = await res.json()
      setAgents(prev => [...prev, created])
    }
    setSaving(false); setShowForm(false)
  }

  async function toggle(agent: ExecutionUnit) {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !agent.is_active }),
    })
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a))
  }

  function toggleCap(cap: Capability) {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap) ? f.capabilities.filter(c => c !== cap) : [...f.capabilities, cap],
    }))
  }

  function toggleTool(tool: string) {
    setForm(f => ({
      ...f,
      tools_allowed: f.tools_allowed.includes(tool) ? f.tools_allowed.filter(t => t !== tool) : [...f.tools_allowed, tool],
    }))
  }

  const activeCount = agents.filter(a => a.is_active).length
  const agentTypes  = [...new Set(agents.map(a => a.agent_type).filter(Boolean))] as AgentType[]

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        {/* Header */}
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Multi-Agent OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>AI Workforce</h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex gap-4 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span>总计 <span className="text-[var(--text-primary)] font-mono">{agents.length}</span></span>
              <span>运行中 <span className="text-emerald-400 font-mono">{activeCount}</span></span>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
              <Plus size={12} /> 新建 Agent
            </button>
          </div>
        </div>

        {/* Tab filter */}
        <div className="border-b border-[var(--border)] px-8 py-2 flex gap-2 flex-wrap glass shrink-0">
          <button onClick={() => setActiveTab('all')}
            className="text-[10px] px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: activeTab === 'all' ? 'rgba(99,102,241,0.2)' : 'transparent',
              border: `1px solid ${activeTab === 'all' ? 'var(--border-strong)' : 'var(--border)'}`,
              color: activeTab === 'all' ? 'var(--accent-light)' : 'var(--text-muted)',
            }}>
            全部
          </button>
          {agentTypes.map(t => {
            const m = AGENT_TYPE_META[t]
            return (
              <button key={t} onClick={() => setActiveTab(t)}
                className="text-[10px] px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: activeTab === t ? m.bg : 'transparent',
                  border: `1px solid ${activeTab === t ? 'var(--border-strong)' : 'var(--border)'}`,
                  color: activeTab === t ? m.color.replace('text-', '') : 'var(--text-muted)',
                }}>
                {m.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading && <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载 AI 团队中...</p>}

          {!loading && (
            <div className="grid grid-cols-3 gap-4 max-w-5xl">
              {displayed.map(agent => {
                const meta = AGENT_TYPE_META[agent.agent_type ?? 'general'] ?? AGENT_TYPE_META.general
                const TypeIcon = UNIT_TYPE_ICON[agent.type] ?? Zap

                return (
                  <div key={agent.id}
                    className={`glass rounded-xl p-5 group relative transition-all ${!agent.is_active ? 'opacity-50' : ''}`}>

                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="text-2xl">{agent.avatar}</span>
                          <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-[var(--bg-base)] ${agent.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <TypeIcon size={9} className={meta.color} />
                            <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${meta.color}`}
                              style={{ background: meta.bg }}>
                              {meta.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(agent)}
                          className="p-1.5 rounded hover:bg-white/5"
                          style={{ color: 'var(--text-muted)' }}>
                          <Edit2 size={11} />
                        </button>
                        <button onClick={() => toggle(agent)}
                          className={`p-1.5 rounded hover:bg-white/5 transition-colors ${agent.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <Power size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs mb-3 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {agent.description}
                    </p>

                    {/* Capabilities */}
                    {agent.capabilities?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(agent.capabilities as Capability[]).map(cap => {
                          const cl = ALL_CAPS.find(c => c.value === cap)?.label ?? cap
                          return (
                            <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              {cl}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Tools */}
                    {agent.tools_allowed?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(agent.tools_allowed as string[]).map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--border)', color: 'var(--accent-light)' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Performance stats */}
                    {(() => {
                      const s = (agent as ExecutionUnit & { stats?: { total_runs: number; approved_count: number; revision_count: number; failed_count: number; approval_rate: number; average_score: number } }).stats
                      if (!s || s.total_runs === 0) return (
                        <div className="text-[9px] pt-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                          暂无执行记录
                        </div>
                      )
                      return (
                        <div className="grid grid-cols-3 gap-1 pt-2.5 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                          <div>
                            <p className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>运行</p>
                            <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{s.total_runs}</p>
                          </div>
                          <div>
                            <p className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>通过率</p>
                            <p className="text-xs font-mono text-emerald-400">{s.approval_rate}%</p>
                          </div>
                          <div>
                            <p className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>评分</p>
                            <p className="text-xs font-mono text-amber-400">{s.average_score > 0 ? s.average_score : '—'}</p>
                          </div>
                          {s.revision_count > 0 && (
                            <p className="col-span-3 text-[9px] mt-1 text-amber-400">⚠ {s.revision_count} 次返工</p>
                          )}
                          {s.failed_count > 0 && (
                            <p className="col-span-3 text-[9px] mt-1 text-red-400">✕ {s.failed_count} 次失败</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {displayed.length === 0 && !loading && (
                <div className="col-span-3 text-center py-20">
                  <p className="text-[var(--text-muted)] text-sm mb-4">暂无 Agent</p>
                  <button onClick={openCreate} className="text-[var(--accent-light)] text-sm hover:text-white transition-colors">
                    创建第一个 Agent →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Dispatch Rules */}
          {!loading && (
            <div className="glass rounded-xl p-5 mt-6 max-w-5xl">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Dispatch 路由规则</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { type: '产品任务', agent: 'Product Agent', cap: '产品/PRD/用户故事' },
                  { type: '开发任务', agent: 'Engineering Agent', cap: '代码/API/Bug修复' },
                  { type: '调研任务', agent: 'Research Agent', cap: '竞品/市场/数据整理' },
                  { type: '增长任务', agent: 'Growth Agent', cap: '获客/内容/SEO' },
                  { type: '财务任务', agent: 'Finance Agent', cap: '预算/成本/盈亏' },
                  { type: '设计任务', agent: 'Design Agent', cap: 'UI/UX/原型/品牌' },
                  { type: '3D任务', agent: '3D Avatar Agent', cap: '角色/动作/表情' },
                  { type: '测试任务', agent: 'QA Agent', cap: '测试/验收/Bug检查' },
                  { type: '部署任务', agent: 'DevOps Agent', cap: 'CI/CD/Vercel/GitHub' },
                  { type: '风险任务', agent: 'Linda 战略助理', cap: '法律/合规/风险' },
                ].map(rule => (
                  <div key={rule.type} className="text-[9px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{rule.type}</p>
                    <p className="text-[var(--accent-light)] mb-1">{rule.agent}</p>
                    <p style={{ color: 'var(--text-muted)' }}>{rule.cap}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Agent Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-auto"
            style={{ border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editId ? '编辑 Agent' : '新建 Agent'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="label-xs">类型</label>
                <div className="flex gap-2">
                  {(['human','ai','agent','tool'] as const).map(t => {
                    const Icon = UNIT_TYPE_ICON[t]
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs transition-all"
                        style={{
                          border: `1px solid ${form.type === t ? 'var(--border-strong)' : 'var(--border)'}`,
                          background: form.type === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                          color: form.type === t ? 'var(--accent-light)' : 'var(--text-muted)',
                        }}>
                        <Icon size={11} /> {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Agent type */}
              <div>
                <label className="label-xs">专业类型</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AGENT_TYPE_META).map(([type, meta]) => (
                    <button key={type} onClick={() => setForm(f => ({ ...f, agent_type: type as AgentType }))}
                      className="text-[10px] px-2 py-1 rounded-lg transition-all"
                      style={{
                        border: `1px solid ${form.agent_type === type ? 'var(--border-strong)' : 'var(--border)'}`,
                        background: form.agent_type === type ? meta.bg : 'transparent',
                        color: form.agent_type === type ? meta.color.replace('text-','') : 'var(--text-muted)',
                      }}>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar + Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-xs">头像</label>
                  <div className="flex flex-wrap gap-1.5">
                    {AVATARS.map(a => (
                      <button key={a} onClick={() => setForm(f => ({ ...f, avatar: a }))}
                        className="w-7 h-7 text-sm rounded flex items-center justify-center"
                        style={{ border: `1px solid ${form.avatar === a ? 'var(--accent)' : 'var(--border)'}`, background: form.avatar === a ? 'rgba(99,102,241,0.15)' : 'transparent' }}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label-xs">名称</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Agent 名称"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <label className="label-xs mt-2">描述</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="简短描述"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              {/* Capabilities */}
              <div>
                <label className="label-xs">能力标签</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_CAPS.map(c => {
                    const on = form.capabilities.includes(c.value)
                    return (
                      <button key={c.value} onClick={() => toggleCap(c.value)}
                        className="text-xs px-2.5 py-1 rounded-lg transition-all"
                        style={{
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'rgba(99,102,241,0.2)' : 'transparent',
                          color: on ? 'var(--accent-light)' : 'var(--text-muted)',
                        }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className="label-xs">允许工具</label>
                <div className="flex flex-wrap gap-1.5">
                  {TOOL_OPTIONS.map(t => {
                    const on = form.tools_allowed.includes(t)
                    return (
                      <button key={t} onClick={() => toggleTool(t)}
                        className="text-[10px] px-2 py-1 rounded-lg font-mono transition-all"
                        style={{
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'rgba(99,102,241,0.15)' : 'transparent',
                          color: on ? 'var(--accent-light)' : 'var(--text-muted)',
                        }}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="label-xs">System Prompt</label>
                <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                  placeholder="Agent 的核心系统提示词（会注入到 Claude system prompt）..."
                  rows={4} className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving || !form.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  <Check size={14} /> {saving ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-lg text-sm"
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
