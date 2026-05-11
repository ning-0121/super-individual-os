'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cpu, ExternalLink } from 'lucide-react'

interface CostPayload {
  today_calls: number
  today_cost_usd: number
  today_fallbacks: number
  today_errors: number
  week_cost_usd: number
  by_provider: Array<{ provider: string; calls: number; cost_usd: number }>
  default_model: { provider: string; model: string; reason: string }
}

function fmt(usd: number): string {
  if (!usd || usd === 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(4)}`
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#a78bfa', openai: '#22d3ee', gemini: '#34d399',
  mock: '#94a3b8', deepseek: '#fbbf24', local: '#fb923c',
}

export default function CostPulseCard() {
  const [data, setData] = useState<CostPayload | null>(null)

  useEffect(() => {
    fetch('/api/cost-pulse').then(r => r.ok ? r.json() : null)
      .then(setData).catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-violet-400">
        <Cpu size={12} />
        <span className="text-xs font-semibold uppercase tracking-wider">AI Gateway · 今日</span>
        <Link href="/tools/autonomy" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
          详情 <ExternalLink size={9} />
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Mini label="调用" value={data.today_calls} />
        <Mini label="成本" value={fmt(data.today_cost_usd)} accent="text-violet-400" />
        <Mini label="fallback" value={data.today_fallbacks}
          accent={data.today_fallbacks > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <Mini label="错误" value={data.today_errors}
          accent={data.today_errors > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      <div className="flex items-center gap-1.5 text-[10px] mb-2"
        style={{ color: 'var(--text-muted)' }}>
        <span>默认模型：</span>
        <code className="font-mono px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)' }}>
          {data.default_model.provider} · {data.default_model.model}
        </code>
      </div>

      {data.by_provider.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {data.by_provider.map(p => {
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

      {data.today_calls === 0 && (
        <div className="text-[10px] text-center py-1" style={{ color: 'var(--text-muted)' }}>
          今天还没有 AI 调用 — 去 <Link href="/chat" className="text-[var(--accent-light)]">/chat</Link> 试试
        </div>
      )}

      <p className="text-[9px] mt-2 pt-2"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        7d 累计：{fmt(data.week_cost_usd)}
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
