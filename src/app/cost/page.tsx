'use client'
import { useEffect, useState, useCallback } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, DollarSign, AlertTriangle, RefreshCw, Cpu, Activity,
  ShieldAlert,
} from 'lucide-react'

interface Summary {
  calls: number
  cost_usd: number
  avg_latency_ms: number
  fallback_count: number
  failure_count: number
  prompt_tokens: number
  completion_tokens: number
}
interface ModelRow {
  provider: string; model: string; calls: number
  prompt_tokens: number; completion_tokens: number; total_tokens: number
  estimated_cost: number; avg_latency: number
  fallback_count: number; failure_count: number
}
interface StageRow {
  stage: string; calls: number; cost_usd: number
  avg_latency_ms: number; failure_count: number; failure_rate: number
}
interface CostPayload {
  summary: { today: Summary; week: Summary; month: Summary }
  lifetime: { calls: number }
  by_model: ModelRow[]
  by_stage: StageRow[]
  top_model: ModelRow | null
  guardrails: {
    daily_level:   'ok' | 'warning' | 'critical'
    monthly_level: 'ok' | 'warning' | 'critical'
    overall_level: 'ok' | 'warning' | 'critical'
    daily_pct: number; monthly_pct: number
    banner_message?: string
  }
  thresholds: { daily_warning_usd: number; monthly_warning_usd: number }
  generated_at: string
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#a78bfa', openai: '#22d3ee', gemini: '#34d399',
  deepseek: '#fbbf24', mock: '#94a3b8', local: '#fb923c',
}

const LEVEL_META = {
  ok:       { color: '#34d399', bg: 'rgba(52,211,153,0.06)',  border: 'rgba(52,211,153,0.25)' },
  warning:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.35)' },
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.4)'  },
}

function fmtUSD(usd: number): string {
  if (!usd || usd === 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 1)      return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
function fmtNum(n: number): string { return n.toLocaleString() }
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function CostPage() {
  const [data, setData] = useState<CostPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/cost')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
        </main>
      </div>
    )
  }

  const g = data.guardrails
  const gMeta = LEVEL_META[g.overall_level]

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">AI Cost Dashboard</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>成本与调用</h1>
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} /> 刷新
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-6xl">

          {/* Guardrail banner */}
          {g.banner_message && (
            <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
              style={{ background: gMeta.bg, border: `1px solid ${gMeta.border}`, color: gMeta.color }}>
              {g.overall_level === 'critical'
                ? <AlertTriangle size={14} />
                : <ShieldAlert size={14} />}
              <p className="text-xs flex-1">{g.banner_message}</p>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                日 {Math.round(g.daily_pct * 100)}% · 月 {Math.round(g.monthly_pct * 100)}% (阈值 ${data.thresholds.daily_warning_usd} / ${data.thresholds.monthly_warning_usd})
              </span>
            </div>
          )}

          {/* Hero windows: today / week / month */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <WindowCard title="今日" s={data.summary.today} accent="text-violet-400" />
            <WindowCard title="本周" s={data.summary.week}  accent="text-cyan-400" />
            <WindowCard title="本月" s={data.summary.month} accent="text-pink-400" />
          </div>

          {/* Top model + lifetime stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                最贵模型（本月）
              </p>
              {data.top_model ? (
                <>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {data.top_model.provider} · {data.top_model.model}
                  </p>
                  <p className="text-base font-mono text-violet-400">{fmtUSD(data.top_model.estimated_cost)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {data.top_model.calls} 次 · {fmtNum(data.top_model.total_tokens)} tok
                  </p>
                </>
              ) : (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>本月暂无成本数据</p>
              )}
            </div>
            <Stat label="本月 fallback" value={data.summary.month.fallback_count}
              accent={data.summary.month.fallback_count > 0 ? 'text-amber-400' : 'text-emerald-400'}
              sub="fallback 次数过多说明主 provider 不稳定" />
            <Stat label="本月失败" value={data.summary.month.failure_count}
              accent={data.summary.month.failure_count > 0 ? 'text-red-400' : 'text-emerald-400'}
              sub={`生涯调用 ${fmtNum(data.lifetime.calls)} 次`} />
          </div>

          {/* By-model table */}
          <div className="glass rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3 text-cyan-400">
              <Cpu size={12} />
              <p className="text-xs font-semibold uppercase tracking-wider">按模型 · 本月</p>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{data.by_model.length} 个模型</span>
            </div>
            {data.by_model.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>本月还没有调用 — 去 /chat 试试</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ color: 'var(--text-muted)' }} className="text-left">
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider">Provider</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider">Model</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">Calls</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">In</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">Out</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">Cost</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">Avg lat</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">FB</th>
                      <th className="py-1 pr-3 text-[9px] uppercase tracking-wider text-right">Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_model.map(m => {
                      const color = PROVIDER_COLOR[m.provider] ?? '#94a3b8'
                      return (
                        <tr key={`${m.provider}-${m.model}`} style={{ color: 'var(--text-secondary)' }}>
                          <td className="py-1 pr-3">
                            <code className="font-mono text-[10px] px-1 py-0.5 rounded uppercase"
                              style={{ background: `${color}15`, color }}>
                              {m.provider}
                            </code>
                          </td>
                          <td className="py-1 pr-3 font-mono">{m.model}</td>
                          <td className="py-1 pr-3 text-right">{fmtNum(m.calls)}</td>
                          <td className="py-1 pr-3 text-right">{fmtNum(m.prompt_tokens)}</td>
                          <td className="py-1 pr-3 text-right">{fmtNum(m.completion_tokens)}</td>
                          <td className="py-1 pr-3 text-right font-mono text-violet-400">{fmtUSD(m.estimated_cost)}</td>
                          <td className="py-1 pr-3 text-right">{fmtMs(m.avg_latency)}</td>
                          <td className="py-1 pr-3 text-right">
                            <span className={m.fallback_count > 0 ? 'text-amber-400' : ''}>{m.fallback_count}</span>
                          </td>
                          <td className="py-1 pr-3 text-right">
                            <span className={m.failure_count > 0 ? 'text-red-400' : ''}>{m.failure_count}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* By-stage table */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 text-pink-400">
              <Activity size={12} />
              <p className="text-xs font-semibold uppercase tracking-wider">按 stage · 本月</p>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{data.by_stage.length} 类</span>
            </div>
            {data.by_stage.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>暂无</p>
            ) : (
              <div className="space-y-1">
                {data.by_stage.map(s => {
                  const pct = data.summary.month.cost_usd > 0
                    ? Math.round(100 * s.cost_usd / data.summary.month.cost_usd) : 0
                  return (
                    <div key={s.stage} className="text-[11px]">
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(244,114,182,0.1)', color: '#f472b6' }}>
                          {s.stage}
                        </code>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtNum(s.calls)} 次</span>
                        <span style={{ color: 'var(--text-muted)' }}>· {fmtMs(s.avg_latency_ms)} avg</span>
                        {s.failure_count > 0 && (
                          <span className="text-red-400">· {(s.failure_rate * 100).toFixed(0)}% fail</span>
                        )}
                        <span className="ml-auto font-mono text-violet-400">{fmtUSD(s.cost_usd)}</span>
                        <span className="text-[10px] w-9 text-right" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-1 rounded-full"
                          style={{ width: `${pct}%`, background: '#f472b6' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

function WindowCard({ title, s, accent }: { title: string; s: Summary; accent: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign size={11} className={accent} />
        <p className={`text-xs font-semibold uppercase tracking-wider ${accent}`}>{title}</p>
      </div>
      <p className="text-2xl font-mono mb-2" style={{ color: 'var(--text-primary)' }}>{fmtUSD(s.cost_usd)}</p>
      <div className="grid grid-cols-3 gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <div><p className="uppercase tracking-wider">调用</p><p className="font-mono text-[var(--text-secondary)]">{fmtNum(s.calls)}</p></div>
        <div><p className="uppercase tracking-wider">avg lat</p><p className="font-mono text-[var(--text-secondary)]">{fmtMs(s.avg_latency_ms)}</p></div>
        <div><p className="uppercase tracking-wider">tokens</p><p className="font-mono text-[var(--text-secondary)]">{fmtNum(s.prompt_tokens + s.completion_tokens)}</p></div>
      </div>
      <div className="flex gap-2 mt-2 text-[9px]">
        {s.fallback_count > 0 && <span className="text-amber-400">fallback {s.fallback_count}</span>}
        {s.failure_count > 0 && <span className="text-red-400">fail {s.failure_count}</span>}
      </div>
    </div>
  )
}

function Stat({ label, value, accent, sub }: {
  label: string; value: number | string; accent?: string; sub?: string
}) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-2xl font-mono ${accent ?? ''}`}
        style={accent ? undefined : { color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
