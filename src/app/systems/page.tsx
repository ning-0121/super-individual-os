'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, Network, Plus, X, Check } from 'lucide-react'
import Link from 'next/link'

interface SystemRow {
  id: string; name: string; description: string; status: string; created_at: string;
}

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  async function load() {
    const r = await fetch('/api/systems')
    if (r.ok) {
      const data = await r.json()
      setSystems(data.systems ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!name.trim()) return
    await fetch('/api/systems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
    })
    setName(''); setDesc(''); setAdding(false); load()
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

        <div className="flex-1 overflow-auto p-6 max-w-4xl">
          {adding && (
            <div className="glass-strong rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>新建 System</p>
                <button onClick={() => setAdding(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
              </div>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="System 名称（如：我的创业组合 / 客户咨询线）"
                className="w-full text-xs px-3 py-2 rounded mb-2 focus:outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <textarea value={desc} onChange={e => setDesc(e.target.value)}
                rows={2} placeholder="描述（选填）"
                className="w-full text-xs px-3 py-2 rounded mb-3 focus:outline-none resize-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <button onClick={create}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white"
                style={{ background: 'var(--accent)' }}>
                <Check size={11} /> 创建
              </button>
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}

          {!loading && systems.length === 0 && (
            <div className="text-center py-16">
              <Network size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>还没有 System</p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                System 是 Project 之上的分组（如「我的创业组合」「客户咨询」），让你按业务线管理多项目。
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {systems.map(s => (
              <div key={s.id} className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase"
                    style={{ background: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}>
                    {s.status}
                  </span>
                </div>
                {s.description && (
                  <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{s.description}</p>
                )}
                <Link href="/mission-control" className="text-[10px] text-[var(--accent-light)]">
                  → Mission Control
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
