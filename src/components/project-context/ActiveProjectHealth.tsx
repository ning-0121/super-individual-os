'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, ChevronRight, AlertTriangle, Activity } from 'lucide-react'

interface LockedItem {
  project_id: string
  project_name: string
  context_version: number
  current_focus: string
  project_goal: string
}

interface HealthSlice {
  project_id: string
  project_name: string
  score: number
  status: 'healthy' | 'warning' | 'critical'
  blocked: number
  next_action: string
  last_activity_at: string | null
}

const STATUS_COLOR = {
  healthy:  { color: '#34d399', label: '健康'   },
  warning:  { color: '#fbbf24', label: '警告'   },
  critical: { color: '#f87171', label: '关键'   },
}

// Mission Control's "Active Project Health" — shows health stats for every
// currently locked project. If none are locked, the component renders nothing.
export default function ActiveProjectHealth() {
  const [items, setItems] = useState<HealthSlice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/projects/locked')
      if (!r.ok) { setLoading(false); return }
      const d = await r.json() as { locked: LockedItem[] }
      const locked = d.locked ?? []
      if (locked.length === 0) { setLoading(false); return }

      const results = await Promise.all(locked.map(async (li) => {
        const hr = await fetch(`/api/projects/${li.project_id}/health`)
        if (!hr.ok) return null
        const h = await hr.json()
        return {
          project_id: li.project_id,
          project_name: li.project_name,
          score: h.health.score as number,
          status: h.health.status as 'healthy' | 'warning' | 'critical',
          blocked: (h.metrics.blocked_tasks as number) ?? 0,
          next_action: (h.context_summary.next_actions[0]?.text as string) ?? '尚未明确',
          last_activity_at: (h.metrics.last_activity_at as string | null) ?? null,
        } satisfies HealthSlice
      }))
      setItems(results.filter((x): x is HealthSlice => !!x))
      setLoading(false)
    })()
  }, [])

  if (loading || items.length === 0) return null

  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3 text-emerald-400">
        <Heart size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">Active Project Health</span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {items.length} locked
        </span>
      </div>
      <div className="space-y-2">
        {items.map(it => {
          const meta = STATUS_COLOR[it.status]
          return (
            <Link key={it.project_id} href={`/projects/${it.project_id}`}
              className="block p-3 rounded-lg hover:bg-white/5 transition-colors"
              style={{ background: 'var(--bg-base)', border: `1px solid ${meta.color}40` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm shrink-0"
                  style={{ background: `${meta.color}15`, color: meta.color, border: `1.5px solid ${meta.color}40` }}>
                  {it.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{it.project_name}</p>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                      style={{ background: `${meta.color}15`, color: meta.color }}>
                      {meta.label}
                    </span>
                    {it.blocked > 0 && (
                      <span className="text-[9px] inline-flex items-center gap-0.5 text-amber-400">
                        <AlertTriangle size={9} /> {it.blocked} 阻塞
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] flex items-center gap-1 truncate" style={{ color: 'var(--text-muted)' }}>
                    <ChevronRight size={9} className="shrink-0" />
                    <span className="truncate">{it.next_action}</span>
                  </p>
                  {it.last_activity_at && (
                    <p className="text-[9px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Activity size={8} /> 最近活动 {new Date(it.last_activity_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
