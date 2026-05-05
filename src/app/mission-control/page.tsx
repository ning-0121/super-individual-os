'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, RefreshCw, Activity, AlertTriangle, Crown, Layers,
  Bot, Sparkles, ExternalLink, TrendingUp, TrendingDown,
} from 'lucide-react'

interface MissionData {
  system_matrix: Array<{ id: string; name: string; description: string; status: string; project_count: number; projects: Array<{ id: string; name: string; status: string; current_stage: number }> }>
  execution_pulse: { runs_7d: number; runs_24h: number; succeeded_7d: number; failed_7d: number; running: number; success_rate: number; p50_duration_ms: number; p95_duration_ms: number }
  risk_radar: { decisions_7d: number; top_flags: Array<{ code: string; count: number }> }
  manager_reports: Array<{ manager_id: string; role: string; name: string; avatar: string; approve: number; reject: number; total: number; approve_rate: number }>
  ceo_decisions: { pending_count: number; pending: Array<{ id: string; action_type: string; risk_level: number; classification_reason: string; created_at: string }>; recent: Array<{ id: string; decision_type: string; created_at: string }> }
  auto_loop_status: { auto_approved_7d: number; ai_manager_unanimous_7d: number; ai_manager_rejected_7d: number; blocked_for_human_7d: number; autonomy_rate: number; pending_approvals: number; available_providers: string[] }
  generated_at: string
}

export default function MissionControlPage() {
  const [data, setData] = useState<MissionData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/mission-control')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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

  if (!data) return null

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        {/* Header */}
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-0.5">Autonomous Org Cockpit</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Mission Control</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              更新于 {new Date(data.generated_at).toLocaleTimeString('zh-CN')}
            </span>
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <RefreshCw size={11} /> 刷新
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-6xl">

          {/* Auto-loop hero */}
          <div className="rounded-xl p-6 mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(167,139,250,0.08))',
              border: '1px solid rgba(34,211,238,0.25)',
            }}>
            <div className="flex items-center gap-3 mb-3">
              <Sparkles size={16} className="text-cyan-400" />
              <p className="text-xs uppercase tracking-widest text-cyan-400">Autonomy Loop · 7 天</p>
            </div>
            <div className="grid grid-cols-5 gap-4">
              <Hero label="自治率" value={`${data.auto_loop_status.autonomy_rate}%`} accent="text-cyan-400" sub="auto vs 人工干预" />
              <Hero label="自动放行" value={data.auto_loop_status.auto_approved_7d} accent="text-emerald-400" />
              <Hero label="AI 经理批准" value={data.auto_loop_status.ai_manager_unanimous_7d} accent="text-violet-400" />
              <Hero label="AI 经理驳回" value={data.auto_loop_status.ai_manager_rejected_7d} accent="text-amber-400" />
              <Hero label="待人工" value={data.auto_loop_status.pending_approvals} accent="text-red-400" sub={data.auto_loop_status.pending_approvals > 0 ? '⚠ 待处理' : ''} />
            </div>
            <div className="mt-3 pt-3 flex items-center gap-3 text-[10px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <span>可用模型 providers:</span>
              {data.auto_loop_status.available_providers.map(p => (
                <code key={p} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: 'var(--bg-base)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                  {p}
                </code>
              ))}
            </div>
          </div>

          {/* Top row: execution pulse + risk radar */}
          <div className="grid grid-cols-2 gap-4 mb-4">

            {/* execution_pulse */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-emerald-400">
                <Activity size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">Execution Pulse · 7 天</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Stat label="总执行" value={data.execution_pulse.runs_7d} />
                <Stat label="成功率" value={`${data.execution_pulse.success_rate}%`} accent="text-emerald-400" />
                <Stat label="失败" value={data.execution_pulse.failed_7d} accent="text-red-400" />
              </div>
              <div className="grid grid-cols-3 gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <div>P50: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{Math.round(data.execution_pulse.p50_duration_ms / 1000)}s</span></div>
                <div>P95: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{Math.round(data.execution_pulse.p95_duration_ms / 1000)}s</span></div>
                <div>正在跑: <span className="font-mono text-amber-400">{data.execution_pulse.running}</span></div>
              </div>
            </div>

            {/* risk_radar */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-amber-400">
                <AlertTriangle size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">Risk Radar · 7 天</span>
              </div>
              {data.risk_radar.top_flags.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>过去 7 天没有检测到风险信号</p>
              ) : (
                <div className="space-y-1.5">
                  {data.risk_radar.top_flags.map(f => (
                    <div key={f.code} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-secondary)' }}>{f.code}</span>
                      <span className="font-mono text-amber-400">×{f.count}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] mt-3 pt-3" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                共 {data.risk_radar.decisions_7d} 次决策被分析
              </p>
            </div>
          </div>

          {/* Middle: manager reports */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-violet-400">
              <Bot size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Manager Reports · 7 天</span>
            </div>
            {data.manager_reports.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>过去 7 天没有经理决策记录</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {data.manager_reports.map(m => (
                  <div key={m.manager_id} className="rounded-lg p-3"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{m.avatar}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{m.name}</p>
                        <p className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{m.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <TrendingUp size={9} /> {m.approve}
                      </span>
                      <span className="text-red-400 flex items-center gap-0.5">
                        <TrendingDown size={9} /> {m.reject}
                      </span>
                      <span className="ml-auto font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {m.approve_rate}% 批准
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom row: CEO decisions + system matrix */}
          <div className="grid grid-cols-2 gap-4 mb-4">

            {/* ceo_decisions */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-red-400">
                <Crown size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">CEO Decisions</span>
                {data.ceo_decisions.pending_count > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded text-red-400"
                    style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)' }}>
                    {data.ceo_decisions.pending_count} 待批
                  </span>
                )}
              </div>
              {data.ceo_decisions.pending.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>无 CEO 待审请求</p>
              ) : (
                <div className="space-y-2">
                  {data.ceo_decisions.pending.map(p => (
                    <Link key={p.id} href="/approvals"
                      className="block text-xs p-2 rounded-lg hover:bg-white/5 transition-colors"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>{p.action_type}</code>
                        <span className="text-[9px] text-red-400">L{p.risk_level}</span>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.classification_reason}</p>
                    </Link>
                  ))}
                </div>
              )}
              <Link href="/approvals" className="text-[10px] mt-3 inline-flex items-center gap-1 text-[var(--accent-light)]">
                前往审批中心 <ExternalLink size={9} />
              </Link>
            </div>

            {/* system_matrix */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-cyan-400">
                <Layers size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">System Matrix</span>
              </div>
              {data.system_matrix.length === 0 ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>还未创建任何 System</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    System 是项目之上的分组层（如"我的创业组合"、"咨询客户"），让你按业务线管理多个项目。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.system_matrix.map(s => (
                    <div key={s.id} className="text-xs p-2 rounded-lg"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <p className="font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.project_count} 个项目 · {s.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

function Hero({ label, value, accent, sub }: { label: string; value: number | string; accent: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-2xl font-mono ${accent}`}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-xl font-mono ${accent ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}
