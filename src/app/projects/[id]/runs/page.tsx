'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react'

interface Run {
  id: string; task_id: string; task_title: string;
  run_status: string; retry_count: number;
  started_at: string; finished_at: string | null;
  summary: string; total_steps: number;
  evaluation: { verdict: string; score: number } | null;
  error_message: string;
}

const STATUS_COLOR: Record<string, string> = {
  queued: '#94a3b8', pending: '#94a3b8',
  running: '#fbbf24', succeeded: '#34d399', completed: '#34d399',
  failed: '#f87171', cancelled: '#94a3b8',
}

export default function ProjectRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/runs`).then(r => r.json())
      .then(d => setRuns(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>

  if (runs.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-[var(--text-muted)] text-sm">本项目还没有任何执行记录</p>
        <p className="text-[var(--text-muted)] text-xs mt-2">在 Tasks 标签页运行 Agent 后会出现在这里</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl space-y-2">
      {runs.map(r => {
        const color = STATUS_COLOR[r.run_status] ?? '#94a3b8'
        const dur = r.finished_at && r.started_at
          ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) + 's'
          : '—'
        return (
          <Link key={r.id} href={`/task-runs/${r.id}`} className="block glass rounded-xl p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.task_title}</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                    {r.run_status}
                  </span>
                  {r.retry_count > 0 && <span className="text-[9px] text-amber-400">↻ {r.retry_count}</span>}
                </div>
                {r.summary && <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{r.summary}</p>}
                <div className="flex items-center gap-3 text-[10px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span>{new Date(r.started_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>·</span>
                  <span>{r.total_steps} 步</span>
                  <span>·</span>
                  <span>{dur}</span>
                  {r.evaluation && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <ShieldCheck size={9} /> QA {r.evaluation.score}/10 ({r.evaluation.verdict})
                      </span>
                    </>
                  )}
                  {r.error_message && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertTriangle size={9} /> {r.error_message.slice(0, 60)}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink size={11} className="text-[var(--text-muted)] mt-1" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
