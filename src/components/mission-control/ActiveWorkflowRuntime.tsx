'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  GitBranch, Loader2, AlertTriangle, CheckCircle2, Lock, RefreshCw, Clock,
} from 'lucide-react'

interface ActiveRun {
  run_id: string
  workflow_id: string
  workflow_name: string
  project_id: string | null
  project_name: string | null
  status: 'pending' | 'running' | 'blocked_approval' | 'succeeded' | 'failed' | 'cancelled'
  bottleneck_step_key: string | null
  current_step_keys: string[]
  completed: number
  total: number
  failed: number
  eta_at: string | null
  started_at: string
  owner: string | null
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  running:          { color: '#34d399', label: 'Running'  },
  pending:          { color: '#22d3ee', label: 'Waiting'  },
  blocked_approval: { color: '#fbbf24', label: 'Blocked'  },
  failed:           { color: '#f87171', label: 'Failed'   },
  succeeded:        { color: '#34d399', label: 'Done'     },
  cancelled:        { color: '#94a3b8', label: 'Cancelled' },
}

function fmtEta(at: string | null): string {
  if (!at) return '—'
  const ms = new Date(at).getTime() - Date.now()
  if (ms <= 0) return '已超期'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.round(mins / 60)}h`
}

export default function ActiveWorkflowRuntime() {
  const [runs, setRuns] = useState<ActiveRun[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/active-workflows')
    if (r.ok) {
      const d = await r.json()
      setRuns(d.runs ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="glass rounded-xl p-5 mb-4 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-cyan-400" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>正在加载工作流运行时…</span>
      </div>
    )
  }
  if (runs.length === 0) return null   // hide widget when no active runs

  // Aggregate counts
  const counts = {
    running:          runs.filter(r => r.status === 'running').length,
    blocked_approval: runs.filter(r => r.status === 'blocked_approval').length,
    failed:           runs.filter(r => r.status === 'failed').length,
    pending:          runs.filter(r => r.status === 'pending').length,
  }

  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3 text-cyan-400">
        <GitBranch size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">Active Workflow Runtime</span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {runs.length} active
        </span>
        <button onClick={load} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]" title="刷新">
          <RefreshCw size={10} />
        </button>
      </div>

      {/* Top stat strip */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Stat label="Running"  value={counts.running}          color="#34d399" />
        <Stat label="Waiting"  value={counts.pending}          color="#22d3ee" />
        <Stat label="Blocked"  value={counts.blocked_approval} color="#fbbf24" />
        <Stat label="Failed"   value={counts.failed}           color="#f87171" />
      </div>

      {/* Run rows */}
      <div className="space-y-1.5">
        {runs.map(r => {
          const meta = STATUS_META[r.status] ?? STATUS_META.running
          const progressPct = r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0
          return (
            <div key={r.run_id} className="rounded-lg p-2.5"
              style={{ background: 'var(--bg-base)', border: `1px solid ${meta.color}40` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                  style={{ background: `${meta.color}15`, color: meta.color }}>
                  {meta.label}
                </span>
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {r.workflow_name}
                </p>
                {r.project_id && (
                  <Link href={`/projects/${r.project_id}`} className="text-[10px] text-[var(--accent-light)] hover:underline">
                    · {r.project_name ?? r.project_id.slice(0, 6)}
                  </Link>
                )}
                <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  {r.completed} / {r.total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full mb-1.5" style={{ background: 'var(--bg-elevated)' }}>
                <div className="h-1 rounded-full"
                  style={{ width: `${progressPct}%`, background: meta.color }} />
              </div>

              {/* Detail row */}
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {r.bottleneck_step_key && (
                  <span className="flex items-center gap-1">
                    {r.status === 'blocked_approval'
                      ? <Lock size={9} className="text-amber-400" />
                      : r.status === 'failed'
                        ? <AlertTriangle size={9} className="text-red-400" />
                        : <CheckCircle2 size={9} style={{ color: meta.color }} />}
                    bottleneck: <code className="font-mono">{r.bottleneck_step_key}</code>
                  </span>
                )}
                {r.owner && <span>· owner {r.owner}</span>}
                <span className="ml-auto inline-flex items-center gap-1">
                  <Clock size={9} /> ETA {fmtEta(r.eta_at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg p-2 text-center"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-base font-mono" style={{ color: value > 0 ? color : 'var(--text-muted)' }}>{value}</p>
    </div>
  )
}
