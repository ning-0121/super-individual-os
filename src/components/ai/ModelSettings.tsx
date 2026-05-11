'use client'
import { useEffect, useState } from 'react'
import { Loader2, Cpu, CheckCircle2, XCircle } from 'lucide-react'

interface Model {
  id: string
  provider: string
  model_name: string
  display_name: string
  cost_input_usd_per_1m: number
  cost_output_usd_per_1m: number
  context_window: number
  supports_streaming: boolean
  is_enabled: boolean
  is_default_for_stage: string[]
  notes: string
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#a78bfa', openai: '#22d3ee', gemini: '#34d399', deepseek: '#fbbf24',
  mock: '#94a3b8', local: '#fb923c',
}

export default function ModelSettings() {
  const [models, setModels] = useState<Model[]>([])
  const [providers, setProviders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/model-registry').then(r => r.ok ? r.json() : { models: [], available_providers: [] })
      .then(d => { setModels(d.models ?? []); setProviders(d.available_providers ?? []) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="glass rounded-xl p-5 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-[var(--accent-light)]" />
      </div>
    )
  }

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 text-violet-400">
        <Cpu size={13} />
        <p className="text-xs font-semibold uppercase tracking-wider">Model Settings</p>
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
        AI Gateway 路由会从下面的模型中挑选；当前可用的 provider（已配置 API key）：
        {providers.length === 0 ? ' 无 — 仅 mock 可用' : providers.map(p => (
          <code key={p} className="ml-1.5 font-mono text-[10px] px-1 rounded"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)' }}>{p}</code>
        ))}
      </p>
      {models.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          model_registry 尚未播种 — 请运行 supabase/v2.6-ai-gateway.sql
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {models.map(m => {
            const providerEnabled = providers.includes(m.provider) || m.provider === 'mock'
            const color = PROVIDER_COLOR[m.provider] ?? '#94a3b8'
            return (
              <div key={m.id} className="rounded-lg p-3"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  opacity: m.is_enabled && providerEnabled ? 1 : 0.55,
                }}>
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                    style={{ background: `${color}15`, color }}>
                    {m.provider}
                  </code>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{m.display_name}</p>
                  {m.is_enabled && providerEnabled
                    ? <CheckCircle2 size={10} className="text-emerald-400 ml-auto" />
                    : <XCircle size={10} className="text-[var(--text-muted)] ml-auto" />}
                </div>
                <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{m.model_name}</p>
                <div className="mt-1.5 flex gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>in <span style={{ color: 'var(--text-secondary)' }}>${m.cost_input_usd_per_1m}/M</span></span>
                  <span>out <span style={{ color: 'var(--text-secondary)' }}>${m.cost_output_usd_per_1m}/M</span></span>
                  <span>ctx <span style={{ color: 'var(--text-secondary)' }}>{Math.round(m.context_window / 1000)}k</span></span>
                </div>
                {(m.is_default_for_stage ?? []).length > 0 && (
                  <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    默认: {m.is_default_for_stage.join(', ')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
