'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, Target, AlertTriangle, ArrowRight, Sparkles, ShieldCheck,
  RefreshCw,
} from 'lucide-react'

interface CommandPayload {
  command: {
    kind: string
    tone: 'critical' | 'warning' | 'neutral' | 'positive'
    headline: string
    detail: string
    top_risk: string
    primary_cta_label: string
    primary_cta_href: string
    user_action_count: number
    suggested_next: string
  }
  counts: {
    pending_total: number
    ceo_pending: number
    critical_pending: number
    high_pending: number
    manager_intervention: number
    failed_runs_24h: number
    blocked_workflows: number
    today_cost_usd: number
  }
}

function fmtUsd(usd: number): string {
  if (!usd || usd === 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

const TONE: Record<string, { bar: string; bg: string; border: string; ring: string; chip: string }> = {
  critical: { bar: '#f87171', bg: 'rgba(248,113,113,0.06)',  border: 'rgba(248,113,113,0.35)', ring: 'rgba(248,113,113,0.18)', chip: '#f87171' },
  warning:  { bar: '#fbbf24', bg: 'rgba(251,191,36,0.06)',   border: 'rgba(251,191,36,0.35)',  ring: 'rgba(251,191,36,0.18)',  chip: '#fbbf24' },
  neutral:  { bar: '#22d3ee', bg: 'rgba(34,211,238,0.05)',   border: 'rgba(34,211,238,0.25)',  ring: 'rgba(34,211,238,0.12)',  chip: '#22d3ee' },
  positive: { bar: '#34d399', bg: 'rgba(52,211,153,0.05)',   border: 'rgba(52,211,153,0.25)',  ring: 'rgba(52,211,153,0.12)',  chip: '#34d399' },
}

export default function TodayCommandCard() {
  const [data, setData] = useState<CommandPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/today-command')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="rounded-xl p-5 mb-4 flex items-center justify-center"
        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <Loader2 size={16} className="animate-spin text-[var(--accent-light)]" />
      </div>
    )
  }

  const c = data.command
  const t = TONE[c.tone] ?? TONE.neutral

  return (
    <div className="rounded-xl mb-4 overflow-hidden relative"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}>
      {/* Left tone bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: t.bar }} />
      <div className="p-5 pl-6">

        {/* Header line */}
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={12} style={{ color: t.bar }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.bar }}>
            今天最重要的事
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-1"
            style={{ background: t.ring, color: t.chip }}>
            {c.kind}
          </span>
          <button onClick={load}
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            title="刷新">
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Headline + detail */}
        <h2 className="text-lg font-semibold leading-tight mb-1.5" style={{ color: 'var(--text-primary)' }}>
          {c.headline}
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{c.detail}</p>

        {/* 4-stat row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Stat label="最高风险" value={c.top_risk} small accent={t.chip} icon={AlertTriangle} />
          <Stat label="需我处理"
            value={c.user_action_count.toString()}
            accent={c.user_action_count > 0 ? t.chip : '#34d399'}
            icon={ShieldCheck}
            sub={`CEO ${data.counts.ceo_pending} · 经理 ${data.counts.manager_intervention}`} />
          <Stat label="AI 建议下一步" value={c.suggested_next} small icon={Target} />
          <div className="flex flex-col items-stretch justify-center">
            <Link href={c.primary_cta_href}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-3 rounded-lg transition-all"
              style={{ background: t.ring, color: t.chip, border: `1px solid ${t.border}` }}>
              {c.primary_cta_label}
              <ArrowRight size={11} />
            </Link>
            <p className="text-[9px] mt-1 text-center" style={{ color: 'var(--text-muted)' }}>一键执行</p>
          </div>
        </div>

        {/* The 3-number "today radar" — one glance: what needs me, what's stuck, what it costs */}
        <div className="flex items-center gap-2 text-[11px]">
          <Link href="/approvals"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>待批</span>
            <span className="font-mono font-semibold"
              style={{ color: data.counts.pending_total > 0 ? '#fbbf24' : '#34d399' }}>
              {data.counts.pending_total}
            </span>
          </Link>
          <Link href="/projects"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>卡住 workflow</span>
            <span className="font-mono font-semibold"
              style={{ color: data.counts.blocked_workflows > 0 ? '#fb923c' : '#34d399' }}>
              {data.counts.blocked_workflows}
            </span>
          </Link>
          <Link href="/cost"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>今日成本</span>
            <span className="font-mono font-semibold text-violet-400">
              {fmtUsd(data.counts.today_cost_usd)}
            </span>
          </Link>
          {data.counts.failed_runs_24h > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}>
              <span style={{ color: 'var(--text-muted)' }}>24h 失败</span>
              <span className="font-mono font-semibold text-red-400">{data.counts.failed_runs_24h}</span>
            </span>
          )}
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent, small, icon: Icon }: {
  label: string; value: string; sub?: string;
  accent?: string; small?: boolean; icon?: typeof Target
}) {
  return (
    <div className="rounded-lg p-2.5 min-w-0"
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)' }}>
      <p className="text-[9px] uppercase tracking-wider mb-1 flex items-center gap-1"
        style={{ color: 'var(--text-muted)' }}>
        {Icon && <Icon size={9} />} {label}
      </p>
      <p className={`${small ? 'text-[11px] leading-tight' : 'text-xl font-mono'} ${small ? 'line-clamp-3' : ''}`}
        style={{ color: accent ?? 'var(--text-primary)' }}>
        {value}
      </p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
