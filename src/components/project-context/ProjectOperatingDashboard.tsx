'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, Heart, AlertTriangle, ChevronRight, Activity,
  Target, RefreshCw, Pause, Play, Compass,
} from 'lucide-react'

interface HealthData {
  health: {
    score: number
    status: 'healthy' | 'warning' | 'critical'
    breakdown: {
      task_completion_pts: number
      recent_activity_pts: number
      blocked_penalty_pts: number
      next_actions_pts: number
      locked_context_pts: number
    }
  }
  advice: {
    recommendation: 'stop' | 'continue' | 'pivot'
    reason: string
    confidence: number
  }
  metrics: {
    total_tasks: number
    completed_tasks: number
    blocked_tasks: number
    activity_count_7d: number
    has_next_actions: boolean
    has_locked_context: boolean
    last_activity_at: string | null
  }
  context_summary: {
    project_goal: string
    current_stage: string
    current_focus: string
    blockers: Array<{ text: string }>
    next_actions: Array<{ text: string }>
    locked: boolean
    context_version: number
    owner_execution_unit_id: string | null
    active_workflow_id: string | null
  }
  recent_activity: Array<{
    id: string; activity_type: string; title: string; created_at: string
  }>
}

const STATUS_META = {
  healthy:  { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.3)', label: '健康'   },
  warning:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', label: '警告'   },
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', label: '关键'   },
}

const ADVICE_META = {
  continue: { icon: Play,    color: 'text-emerald-400', label: 'Continue' },
  pivot:    { icon: Compass, color: 'text-amber-400',   label: 'Pivot'    },
  stop:     { icon: Pause,   color: 'text-red-400',     label: 'Stop'     },
}

export default function ProjectOperatingDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/projects/${projectId}/health`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 mb-4 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-[var(--accent-light)]" />
      </div>
    )
  }

  const sm = STATUS_META[data.health.status]
  const advice = ADVICE_META[data.advice.recommendation]
  const AdviceIcon = advice.icon
  const completion = data.metrics.total_tasks > 0
    ? Math.round(100 * data.metrics.completed_tasks / data.metrics.total_tasks)
    : 0

  return (
    <div className="glass rounded-xl p-5 mb-4" style={{ border: `1px solid ${sm.border}` }}>

      {/* Header: health score + advice */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center font-mono font-bold"
          style={{ background: sm.bg, color: sm.color, border: `2px solid ${sm.border}` }}>
          {data.health.score}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Heart size={11} style={{ color: sm.color }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: sm.color }}>
              Project Health · {sm.label}
            </p>
            <button onClick={load}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              title="刷新">
              <RefreshCw size={10} />
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {data.metrics.completed_tasks} / {data.metrics.total_tasks} 任务 ({completion}%) ·
            blocked {data.metrics.blocked_tasks} ·
            7d 活动 {data.metrics.activity_count_7d}
          </p>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${advice.color} mb-0.5`}>
            <AdviceIcon size={12} />
            {advice.label}
          </div>
          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            confidence {Math.round(data.advice.confidence * 100)}%
          </p>
        </div>
      </div>

      {/* Advice copy */}
      <div className="text-[11px] p-2 rounded-lg mb-3"
        style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
        💡 {data.advice.reason}
      </div>

      {/* Breakdown bar */}
      <div className="grid grid-cols-5 gap-1 mb-3">
        <Bar label="完成" pts={data.health.breakdown.task_completion_pts} max={30} color="#22d3ee" />
        <Bar label="活跃" pts={data.health.breakdown.recent_activity_pts} max={20} color="#a78bfa" />
        <Bar label="阻塞" pts={data.health.breakdown.blocked_penalty_pts} max={20} color="#fbbf24" />
        <Bar label="Next" pts={data.health.breakdown.next_actions_pts} max={15} color="#34d399" />
        <Bar label="Lock" pts={data.health.breakdown.locked_context_pts} max={15} color="#a78bfa" />
      </div>

      {/* Three columns: goal + next + blockers */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Col icon={Target} title="当前唯一目标" color="text-cyan-400"
          body={data.context_summary.project_goal || '尚未设置 — 在右侧 Panel 填写'}
          sub={data.context_summary.current_focus} />
        <Col icon={ChevronRight} title="下一步动作" color="text-emerald-400"
          body={data.context_summary.next_actions[0]?.text ?? '尚未明确'}
          sub={data.context_summary.next_actions.length > 1
            ? `+${data.context_summary.next_actions.length - 1} 项`
            : undefined} />
        <Col icon={AlertTriangle} title="当前最大风险" color="text-amber-400"
          body={data.context_summary.blockers[0]?.text ?? '无阻塞'}
          sub={data.context_summary.blockers.length > 1
            ? `+${data.context_summary.blockers.length - 1} 项`
            : undefined} />
      </div>

      {/* Recent activity */}
      {data.recent_activity.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}>
            <Activity size={9} /> 最近活动
          </p>
          <div className="space-y-1">
            {data.recent_activity.map(a => (
              <div key={a.id} className="text-[10px] flex items-center gap-2 p-1.5 rounded"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <code className="font-mono px-1 rounded text-[9px]"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {a.activity_type}
                </code>
                <span style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {new Date(a.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage + owner footer */}
      <div className="flex items-center gap-3 text-[10px] mt-3 pt-3"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        {data.context_summary.current_stage && <span>阶段：{data.context_summary.current_stage}</span>}
        <span>context v{data.context_summary.context_version}</span>
        {data.context_summary.locked && <span className="text-emerald-400">● locked</span>}
        {data.context_summary.active_workflow_id && (
          <Link href={`/projects/${projectId}/runs`} className="ml-auto text-[var(--accent-light)]">
            workflow →
          </Link>
        )}
      </div>
    </div>
  )
}

function Bar({ label, pts, max, color }: { label: string; pts: number; max: number; color: string }) {
  const pct = Math.round(100 * pts / max)
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
        <span>{label}</span>
        <span style={{ color }}>{pts}/{max}</span>
      </div>
      <div className="h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Col({ icon: Icon, title, color, body, sub }: {
  icon: typeof Target; title: string; color: string; body: string; sub?: string
}) {
  return (
    <div className="rounded-lg p-2.5"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <div className={`flex items-center gap-1 mb-1 ${color}`}>
        <Icon size={9} />
        <p className="text-[9px] uppercase tracking-wider">{title}</p>
      </div>
      <p className="text-[11px] line-clamp-2" style={{ color: 'var(--text-primary)' }}>{body}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
