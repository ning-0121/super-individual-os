'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, Network, ArrowLeft, AlertTriangle, FolderOpen, CheckSquare,
  Bot, TrendingUp, Activity, Sparkles,
} from 'lucide-react'

interface Overview {
  id: string; name: string; description: string; status: string
  runtime_status: 'error' | 'blocked' | 'running' | 'idle'
  risk_level: 0 | 1 | 2 | 3
  progress_pct: number
  open_tasks: number; total_tasks: number; failed_runs_24h: number
  last_activity_at: string | null
  linked_projects: Array<{ id: string; name: string; status: string; current_stage: number | null }>
  owner_manager: { id: string; role: string; name: string } | null
}

interface Detail {
  overview: Overview
  manager_reports: Array<{ id: string; role: string; summary: string; source: string; generated_at: string }>
  growth_experiments: Array<{ id: string; name: string; status: string; channel: string; current_value: string; target_value: string }>
  tasks: Array<{ id: string; title: string; project_id: string; workflow_status: string; created_at: string }>
}

const STATUS_COLOR: Record<string, string> = {
  error: '#f87171', blocked: '#fbbf24', running: '#34d399', idle: '#94a3b8',
}

const RISK_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: 'calm',   color: '#34d399' },
  1: { label: 'low',    color: '#22d3ee' },
  2: { label: 'medium', color: '#fbbf24' },
  3: { label: 'high',   color: '#f87171' },
}

export default function SystemDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/systems/${id}`)
      .then(async r => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          setError(e?.error?.message ?? r.statusText)
          return
        }
        setData(await r.json())
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-red-400 mb-2">{error || '加载失败'}</p>
            <Link href="/systems" className="text-xs text-[var(--accent-light)]">← 返回 Systems</Link>
          </div>
        </main>
      </div>
    )
  }

  const o = data.overview
  const statusColor = STATUS_COLOR[o.runtime_status]
  const risk = RISK_LABEL[o.risk_level]

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <Link href="/systems" className="text-[10px] text-[var(--text-muted)] inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={10} /> Systems
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Network size={18} className="text-cyan-400" />
              <div>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{o.name}</h1>
                {o.description && (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{o.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-1 rounded uppercase"
                style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                {o.runtime_status}
              </span>
              <span className="text-[10px] font-mono px-2 py-1 rounded uppercase"
                style={{ background: `${risk.color}15`, color: risk.color, border: `1px solid ${risk.color}40` }}>
                risk {risk.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">

          {/* Stat row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="进度" value={`${o.progress_pct}%`} accent="text-cyan-400" />
            <Stat label="开放任务" value={`${o.open_tasks} / ${o.total_tasks}`} />
            <Stat label="24h 失败" value={o.failed_runs_24h} accent={o.failed_runs_24h > 0 ? 'text-red-400' : 'text-emerald-400'} />
            <Stat label="负责人" value={o.owner_manager?.name ?? '—'} small />
          </div>

          {/* Linked projects */}
          <Section icon={FolderOpen} title="Linked Projects" accent="text-cyan-400" count={o.linked_projects.length}>
            {o.linked_projects.length === 0 ? (
              <Empty msg="还没有关联任何项目 — 在 /projects 创建项目后到这里链接它" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {o.linked_projects.map(p => (
                  <Link key={p.id} href={`/projects/${p.id}`}
                    className="block text-xs p-3 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      stage {p.current_stage ?? '?'} · {p.status}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Tasks */}
          <Section icon={CheckSquare} title="Recent Tasks" accent="text-emerald-400" count={data.tasks.length}>
            {data.tasks.length === 0 ? (
              <Empty msg="还没有任务" />
            ) : (
              <div className="space-y-1.5">
                {data.tasks.slice(0, 8).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-[11px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{t.workflow_status}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Manager reports */}
          <Section icon={Bot} title="Manager Reports" accent="text-violet-400" count={data.manager_reports.length}>
            {data.manager_reports.length === 0 ? (
              <Empty msg="No manager report yet — generate by running system analysis." />
            ) : (
              <div className="space-y-2">
                {data.manager_reports.map(r => (
                  <div key={r.id} className="text-[11px] p-3 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-[9px] font-mono px-1.5 py-0.5 rounded text-violet-400"
                        style={{ background: 'rgba(167,139,250,0.1)' }}>{r.role}</code>
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>· {r.source}</span>
                      <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(r.generated_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>{r.summary || '(空)'}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Growth experiments */}
          <Section icon={TrendingUp} title="Growth Experiments" accent="text-pink-400" count={data.growth_experiments.length}>
            {data.growth_experiments.length === 0 ? (
              <div>
                <Empty msg="Growth loop not started — create experiment." />
                <Link href="/growth" className="text-[10px] text-pink-400 inline-flex items-center gap-1 mt-2">
                  → 新建实验
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {data.growth_experiments.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-[11px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                    <div className="flex gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {e.channel && <code className="font-mono">{e.channel}</code>}
                      <span className="font-mono">{e.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Risks */}
          <Section icon={AlertTriangle} title="Risks" accent="text-amber-400" count={o.failed_runs_24h + (o.runtime_status === 'blocked' ? 1 : 0)}>
            {o.runtime_status === 'error' && (
              <div className="text-[11px] p-2 rounded-lg mb-1.5 text-red-400"
                style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
                ⚠ 24h 内 {o.failed_runs_24h} 次执行失败，状态置为 error
              </div>
            )}
            {o.runtime_status === 'blocked' && (
              <div className="text-[11px] p-2 rounded-lg mb-1.5 text-amber-400"
                style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
                ⚠ {o.open_tasks} 个开放任务，但 48h 无活动
              </div>
            )}
            {o.runtime_status === 'idle' && o.failed_runs_24h === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>当前没有检测到风险。</p>
            )}
            {o.runtime_status === 'running' && (
              <p className="text-[11px] flex items-center gap-1.5 text-emerald-400">
                <Sparkles size={11} /> 系统在正常运行中
              </p>
            )}
            {o.last_activity_at && (
              <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Activity size={9} /> 最近活动：{new Date(o.last_activity_at).toLocaleString('zh-CN')}
              </p>
            )}
          </Section>

        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, accent, small }: { label: string; value: number | string; accent?: string; small?: boolean }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`${small ? 'text-sm' : 'text-2xl'} font-mono ${accent ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function Section({ icon: Icon, title, accent, count, children }: {
  icon: typeof Network; title: string; accent: string; count: number; children: React.ReactNode
}) {
  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className={`flex items-center gap-2 mb-3 ${accent}`}>
        <Icon size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{msg}</p>
}
