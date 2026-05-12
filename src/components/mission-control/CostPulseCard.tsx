'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cpu, ExternalLink, AlertTriangle, ShieldAlert } from 'lucide-react'

interface PulsePayload {
  today_calls: number
  today_cost_usd: number
  today_fallbacks: number
  today_errors: number
  week_cost_usd: number
  by_provider: Array<{ provider: string; calls: number; cost_usd: number }>
  default_model: { provider: string; model: string; reason: string }
}

interface CostDashPayload {
  summary: { today: { cost_usd: number }; month: { cost_usd: number; fallback_count: number } }
  top_model: { provider: string; model: string; estimated_cost: number } | null
  guardrails: {
    overall_level: 'ok' | 'warning' | 'critical'
    banner_message?: string
    daily_pct: number
    monthly_pct: number
  }
  thresholds: { daily_warning_usd: number; monthly_warning_usd: number }
}

function fmt(usd: number): string {
  if (!usd || usd === 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#a78bfa', openai: '#22d3ee', gemini: '#34d399',
  mock: '#94a3b8', deepseek: '#fbbf24', local: '#fb923c',
}

const LEVEL_BORDER: Record<string, string> = {
  ok:       'var(--border)',
  warning:  'rgba(251,191,36,0.4)',
  critical: 'rgba(248,113,113,0.5)',
}

export default function CostPulseCard() {
  const [pulse, setPulse] = useState<PulsePayload | null>(null)
  const [dash, setDash]   = useState<CostDashPayload | null>(null)

  useEffect(() => {
    fetch('/api/cost-pulse').then(r => r.ok ? r.json() : null)
      .then(setPulse).catch(() => {})
    fetch('/api/cost').then(r => r.ok ? r.json() : null)
      .then(setDash).catch(() => {})
  }, [])

  if (!pulse) return null

  const guardrail = dash?.guardrails.overall_level ?? 'ok'
  const monthCost = dash?.summary.month.cost_usd ?? 0
  const monthFb = dash?.summary.month.fallback_count ?? pulse.today_fallbacks
  const topModel = dash?.top_model ?? null
  const banner = dash?.guardrails.banner_message

  return (
    <div className="glass rounded-xl p-4" style={{ border: `1px solid ${LEVEL_BORDER[guardrail]}` }}>
      <div className="flex items-center gap-2 mb-3 text-violet-400">
        <Cpu size={12} />
        <span className="text-xs font-semibold uppercase tracking-wider">AI Cost · 今日 / 本月</span>
        <Link href="/cost" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
          打开 Cost <ExternalLink size={9} />
        </Link>
      </div>

      {/* Guardrail warning banner */}
      {banner && (
        <div className="rounded-lg p-2 mb-3 flex items-center gap-1.5 text-[10px]"
          style={{
            background: guardrail === 'critical' ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
            color: guardrail === 'critical' ? '#f87171' : '#fbbf24',
            border: `1px solid ${guardrail === 'critical' ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'}`,
          }}>
          {guardrail === 'critical' ? <AlertTriangle size={10} /> : <ShieldAlert size={10} />}
          {banner}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Mini label="今日" value={fmt(pulse.today_cost_usd)} accent="text-violet-400" />
        <Mini label="本月" value={fmt(monthCost)}
          accent={guardrail === 'critical' ? 'text-red-400' : guardrail === 'warning' ? 'text-amber-400' : 'text-cyan-400'} />
        <Mini label="fallback" value={monthFb}
          accent={monthFb > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <Mini label="错误" value={pulse.today_errors}
          accent={pulse.today_errors > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      {topModel && (
        <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
          最贵：
          <code className="font-mono px-1.5 py-0.5 rounded mx-1"
            style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
            {topModel.provider}·{topModel.model}
          </code>
          <span className="font-mono">{fmt(topModel.estimated_cost)}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] mb-2"
        style={{ color: 'var(--text-muted)' }}>
        <span>默认模型：</span>
        <code className="font-mono px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)' }}>
          {pulse.default_model.provider} · {pulse.default_model.model}
        </code>
      </div>

      {pulse.by_provider.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {pulse.by_provider.map(p => {
            const color = PROVIDER_COLOR[p.provider] ?? '#94a3b8'
            return (
              <code key={p.provider} className="font-mono px-1.5 py-0.5 rounded"
                style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                {p.provider}: {p.calls} · {fmt(p.cost_usd)}
              </code>
            )
          })}
        </div>
      )}

      {pulse.today_calls === 0 && (
        <div className="text-[10px] text-center py-1" style={{ color: 'var(--text-muted)' }}>
          今天还没有 AI 调用 — 去 <Link href="/chat" className="text-[var(--accent-light)]">/chat</Link> 试试
        </div>
      )}

      <p className="text-[9px] mt-2 pt-2"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        阈值 ${dash?.thresholds.daily_warning_usd ?? '–'} / 日 · ${dash?.thresholds.monthly_warning_usd ?? '–'} / 月
      </p>
    </div>
  )
}

function Mini({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-base font-mono ${accent ?? ''}`}
        style={accent ? undefined : { color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}
