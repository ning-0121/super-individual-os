'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, Network, Plus, X, Check, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface SystemRow {
  id: string
  name: string
  description: string
  status: string
  metadata?: Record<string, unknown>
  created_at: string
}

interface ProjectLink {
  system_id: string
  project_id: string
  role: string
}

const TYPE_OPTIONS = [
  { value: 'startup',     label: '创业组合' },
  { value: 'consulting',  label: '客户咨询' },
  { value: 'product',     label: '产品线' },
  { value: 'research',    label: '研究 / 学习' },
  { value: 'other',       label: '其他' },
]

const OWNER_OPTIONS = [
  { value: 'ceo',                 label: 'CEO' },
  { value: 'engineering_manager', label: 'CTO' },
  { value: 'design_manager',      label: 'CPO' },
  { value: 'qa_manager',          label: 'QA' },
  { value: 'growth_manager',      label: 'CGO' },
  { value: 'finance_manager',     label: 'COO' },
  { value: 'risk_manager',        label: 'CSO' },
]

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [links, setLinks] = useState<ProjectLink[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', type: 'startup', business_goal: '', owner_manager: 'ceo',
  })

  async function load() {
    const r = await fetch('/api/systems')
    if (r.ok) {
      const d = await r.json()
      setSystems(d.systems ?? [])
      setLinks(d.links ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!form.name.trim()) { alert('请填写名称'); return }
    await fetch('/api/systems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim(),
        metadata: {
          type: form.type,
          business_goal: form.business_goal.trim(),
          owner_manager: form.owner_manager,
        },
      }),
    })
    setForm({ name: '', description: '', type: 'startup', business_goal: '', owner_manager: 'ceo' })
    setAdding(false); load()
  }

  function projectCount(systemId: string): number {
    return links.filter(l => l.system_id === systemId).length
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-0.5">Systems Layer</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Systems</h1>
          </div>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 新建 System
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">
          {adding && (
            <div className="glass-strong rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>新建 System</p>
                <button onClick={() => setAdding(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
              </div>
              <div className="space-y-2">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="System 名称（必填）"
                  className="w-full text-xs px-3 py-2 rounded focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="描述（选填）"
                  className="w-full text-xs px-3 py-2 rounded resize-none focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <input value={form.business_goal} onChange={e => setForm(f => ({ ...f, business_goal: e.target.value }))}
                  placeholder="商业目标（如：3 个月内 MRR $5k）"
                  className="w-full text-xs px-3 py-2 rounded focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>类型：{o.label}</option>)}
                  </select>
                  <select value={form.owner_manager} onChange={e => setForm(f => ({ ...f, owner_manager: e.target.value }))}
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {OWNER_OPTIONS.map(o => <option key={o.value} value={o.value}>负责人：{o.label}</option>)}
                  </select>
                </div>
                <button onClick={create}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white"
                  style={{ background: 'var(--accent)' }}>
                  <Check size={11} /> 创建 System
                </button>
              </div>
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}

          {!loading && systems.length === 0 && !adding && (
            <div className="text-center py-16">
              <Network size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>还没有 System</p>
              <p className="text-[11px] mt-2 mb-4" style={{ color: 'var(--text-muted)' }}>
                System 是 Project 之上的分组（如「我的创业组合」「客户咨询」），让多项目按业务线统一管理。
              </p>
              <button onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                <Plus size={12} /> Create your first system
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {systems.map(s => {
              const meta = (s.metadata ?? {}) as Record<string, string>
              const ownerLabel = OWNER_OPTIONS.find(o => o.value === meta.owner_manager)?.label
              const typeLabel  = TYPE_OPTIONS.find(o => o.value === meta.type)?.label
              return (
                <Link key={s.id} href={`/systems/${s.id}`} className="block glass rounded-xl p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase"
                      style={{
                        background: s.status === 'active' ? 'rgba(34,211,238,0.12)' : 'rgba(148,163,184,0.12)',
                        color: s.status === 'active' ? '#22d3ee' : '#94a3b8',
                        border: `1px solid ${s.status === 'active' ? 'rgba(34,211,238,0.3)' : 'rgba(148,163,184,0.3)'}`,
                      }}>
                      {s.status}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>{s.description}</p>
                  )}
                  {meta.business_goal && (
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                      🎯 {meta.business_goal}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {typeLabel && <span>类型：{typeLabel}</span>}
                    {ownerLabel && <span>负责：{ownerLabel}</span>}
                    <span className="ml-auto">{projectCount(s.id)} 项目 <ArrowRight size={9} className="inline" /></span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
