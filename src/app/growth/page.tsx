'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, TrendingUp, Plus, X, Check } from 'lucide-react'

interface Experiment {
  id: string; name: string; hypothesis: string; channel: string;
  target_metric: string; baseline_value: string; current_value: string; target_value: string;
  status: string; result_summary: string; next_action: string;
  system_id: string; created_at: string;
}

interface SystemRow { id: string; name: string }

const STATUS_COLOR: Record<string, string> = {
  planning: '#94a3b8', running: '#fbbf24', completed: '#34d399', aborted: '#f87171',
}

export default function GrowthPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    system_id: '', name: '', hypothesis: '', channel: '',
    target_metric: '', baseline_value: '', target_value: '',
  })

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch('/api/growth-experiments').then(r => r.json()),
      fetch('/api/systems').then(r => r.json()),
    ])
    setExperiments(Array.isArray(r1) ? r1 : [])
    setSystems(r2?.systems ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    if (!form.system_id || !form.name.trim()) {
      alert('请选择 System 并填写 Name')
      return
    }
    await fetch('/api/growth-experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setAdding(false)
    setForm({ system_id: '', name: '', hypothesis: '', channel: '',
              target_metric: '', baseline_value: '', target_value: '' })
    load()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/growth-experiments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-pink-400 tracking-widest uppercase mb-0.5">Growth Layer</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Growth Experiments</h1>
          </div>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.3)' }}>
            <Plus size={12} /> 新建实验
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-4xl">
          {adding && (
            <div className="glass-strong rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>新建增长实验</p>
                <button onClick={() => setAdding(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
              </div>
              <div className="space-y-2">
                <select value={form.system_id} onChange={e => setForm(f => ({ ...f, system_id: e.target.value }))}
                  className="w-full text-xs px-3 py-2 rounded focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                  <option value="">选择 System...</option>
                  {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="实验名（如：冷邮件发送 100 封）"
                  className="w-full text-xs px-3 py-2 rounded focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <textarea value={form.hypothesis} onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))}
                  rows={2} placeholder="假设：如果做 X，预期 Y..."
                  className="w-full text-xs px-3 py-2 rounded resize-none focus:outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                    placeholder="渠道（cold-email/twitter/...）"
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <input value={form.target_metric} onChange={e => setForm(f => ({ ...f, target_metric: e.target.value }))}
                    placeholder="目标指标（CTR/...）"
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <input value={form.baseline_value} onChange={e => setForm(f => ({ ...f, baseline_value: e.target.value }))}
                    placeholder="基线（0%）"
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <input value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                    placeholder="目标（5%）"
                    className="text-xs px-3 py-2 rounded focus:outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <button onClick={create}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white"
                  style={{ background: 'var(--accent)' }}>
                  <Check size={11} /> 创建
                </button>
              </div>
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}

          {!loading && experiments.length === 0 && (
            <div className="text-center py-16">
              <TrendingUp size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>还没有增长实验</p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                每个 System 推荐至少 1 个 running 实验，覆盖：调研 / 落地页 / 外联 / 内容 / 反馈
              </p>
            </div>
          )}

          <div className="space-y-2">
            {experiments.map(e => {
              const color = STATUS_COLOR[e.status] ?? '#94a3b8'
              return (
                <div key={e.id} className="glass rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{e.name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                          {e.status}
                        </span>
                        {e.channel && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {e.channel}</span>}
                      </div>
                      {e.hypothesis && (
                        <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>{e.hypothesis}</p>
                      )}
                      {(e.target_metric || e.baseline_value || e.target_value) && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          指标：{e.target_metric} · 基线 {e.baseline_value || '?'} → 目标 {e.target_value || '?'}
                          {e.current_value && <> · 当前 <span className="text-[var(--accent-light)]">{e.current_value}</span></>}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {e.status === 'planning' && (
                        <button onClick={() => updateStatus(e.id, 'running')}
                          className="text-[10px] px-2 py-1 rounded text-amber-400"
                          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                          启动
                        </button>
                      )}
                      {e.status === 'running' && (
                        <button onClick={() => updateStatus(e.id, 'completed')}
                          className="text-[10px] px-2 py-1 rounded text-emerald-400"
                          style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
                          完成
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
