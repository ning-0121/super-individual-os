'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, RefreshCw, Activity, AlertTriangle, Crown, Layers,
  Bot, Sparkles, ExternalLink, TrendingUp, TrendingDown,
} from 'lucide-react'
import CommandBar from '@/components/copilot/CommandBar'
import ManagerBriefings from '@/components/manager-reports/ManagerBriefings'
import LockedProjectBanner from '@/components/project-context/LockedProjectBanner'
import ActiveProjectHealth from '@/components/project-context/ActiveProjectHealth'

interface MissionData {
  system_matrix: Array<{ id: string; name: string; description: string; status: string; project_count: number; projects: Array<{ id: string; name: string; status: string; current_stage: number }> }>
  execution_pulse: { runs_7d: number; runs_24h: number; succeeded_7d: number; failed_7d: number; running: number; success_rate: number; p50_duration_ms: number; p95_duration_ms: number }
  risk_radar: { decisions_7d: number; top_flags: Array<{ code: string; count: number }> }
  manager_reports: Array<{ manager_id: string; role: string; name: string; avatar: string; approve: number; reject: number; total: number; approve_rate: number }>
  manager_reports_summary?: Array<{ role: string; summary: string; source: string; generated_at: string }>
  growth_loop?: { total: number; running: number; planning: number; completed: number; recent: Array<{ id: string; name: string; status: string; channel: string; current_value: string; target_value: string; system_id: string }> }
  ceo_decisions: { pending_count: number; pending: Array<{ id: string; action_type: string; risk_level: number; classification_reason: string; created_at: string }>; recent: Array<{ id: string; decision_type: string; created_at: string }> }
  approval_inbox?: {
    pending_total: number
    today_count: number
    by_risk: { low: number; medium: number; high: number; critical: number }
    recent: Array<{ id: string; action_type: string; risk_label: 'low'|'medium'|'high'|'critical'; title: string; requested_by: string; created_at: string }>
  }
  auto_loop_status: { auto_approved_7d: number; ai_manager_unanimous_7d: number; ai_manager_rejected_7d: number; blocked_for_human_7d: number; autonomy_rate: number; pending_approvals: number; available_providers: string[]; tool_connection_count?: number; growth_loop_active?: boolean }
  tool_autonomy?: {
    runs_7d: number; failed_24h: number; blocked_or_pending: number
    recent_failures: Array<{ id: string; action: string; error_message: string; started_at: string }>
    model_usage: Array<{ provider: string; runs: number; input_tokens: number; output_tokens: number }>
  }
  generated_at: string
}

// V2.1B canonical role labels for the manager-reports summary widget
const ROLE_META: Record<string, { label: string; emoji: string; color: string }> = {
  cto:                 { label: 'CTO',    emoji: '⚙️', color: 'text-emerald-400' },
  engineering_manager: { label: 'CTO',    emoji: '⚙️', color: 'text-emerald-400' },
  coo:                 { label: 'COO',    emoji: '🛠', color: 'text-amber-400'   },
  finance_manager:     { label: 'COO',    emoji: '🛠', color: 'text-amber-400'   },
  cpo:                 { label: 'CPO',    emoji: '🎨', color: 'text-violet-400'  },
  design_manager:      { label: 'CPO',    emoji: '🎨', color: 'text-violet-400'  },
  qa:                  { label: 'QA',     emoji: '🧪', color: 'text-cyan-400'    },
  qa_manager:          { label: 'QA',     emoji: '🧪', color: 'text-cyan-400'    },
  cgo:                 { label: 'CGO',    emoji: '📈', color: 'text-pink-400'    },
  growth_manager:      { label: 'CGO',    emoji: '📈', color: 'text-pink-400'    },
  cso:                 { label: 'CSO',    emoji: '🧭', color: 'text-orange-400'  },
  risk_manager:        { label: 'CSO',    emoji: '🧭', color: 'text-orange-400'  },
}

const CANONICAL_ROLES = ['engineering_manager', 'finance_manager', 'design_manager', 'qa_manager', 'growth_manager', 'risk_manager'] as const

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
            <Link href="/new-venture"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
              <Sparkles size={11} /> + 新 Venture
            </Link>
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

          {/* Locked project banner */}
          <LockedProjectBanner />

          {/* Copilot command bar — top of cockpit */}
          <CommandBar />

          {/* Active Project Health — V2.5+ */}
          <ActiveProjectHealth />

          {/* Manager Briefings — V2.3 */}
          <ManagerBriefings />

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

          {/* Manager Reports Summary — narrative per role */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-violet-400">
              <Bot size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Manager Reports Summary</span>
            </div>
            {(() => {
              const summaries = data.manager_reports_summary ?? []
              const byRole = new Map(summaries.map(s => [s.role, s]))
              return (
                <div className="grid grid-cols-3 gap-3">
                  {CANONICAL_ROLES.map(role => {
                    const meta = ROLE_META[role]
                    const r = byRole.get(role)
                    return (
                      <div key={role} className="rounded-lg p-3"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base">{meta.emoji}</span>
                          <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
                          {r ? (
                            <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(34,211,238,0.1)', color: '#22d3ee' }}>
                              {r.source}
                            </span>
                          ) : (
                            <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>无报告</span>
                          )}
                        </div>
                        {r ? (
                          <>
                            <p className="text-[11px] mb-2 line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                              {r.summary || '(空摘要)'}
                            </p>
                            <p className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                              {new Date(r.generated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            No manager report yet — generate by running system analysis.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Growth Loop Widget */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-pink-400">
              <TrendingUp size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Growth Loop</span>
              <Link href="/growth" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
                查看全部 <ExternalLink size={9} />
              </Link>
            </div>
            {(() => {
              const g = data.growth_loop
              if (!g || g.total === 0) {
                return (
                  <div className="py-6 text-center">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                      Growth loop not started — create experiment.
                    </p>
                    <Link href="/growth" className="text-[10px] inline-flex items-center gap-1 text-pink-400">
                      → 新建实验
                    </Link>
                  </div>
                )
              }
              return (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <Stat label="总实验" value={g.total} accent="text-pink-400" />
                    <Stat label="进行中" value={g.running} accent="text-amber-400" />
                    <Stat label="规划" value={g.planning} accent="text-cyan-400" />
                    <Stat label="完成" value={g.completed} accent="text-emerald-400" />
                  </div>
                  <div className="space-y-1.5">
                    {g.recent.slice(0, 3).map(e => (
                      <div key={e.id} className="flex items-center justify-between text-[11px] p-2 rounded-lg"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {e.channel && <code className="font-mono">{e.channel}</code>}
                          <span className="font-mono">{e.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>

          {/* Approval Inbox — V2.4 */}
          {data.approval_inbox && (
            <div className="glass rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-3 text-amber-400">
                <AlertTriangle size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">Approval Inbox</span>
                <Link href="/approvals" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
                  打开审批中心 <ExternalLink size={9} />
                </Link>
              </div>
              <div className="grid grid-cols-6 gap-3 mb-3">
                <Stat label="待审批" value={data.approval_inbox.pending_total} accent="text-amber-400" />
                <Stat label="今日" value={data.approval_inbox.today_count} />
                <Stat label="low"    value={data.approval_inbox.by_risk.low}    accent="text-emerald-400" />
                <Stat label="medium" value={data.approval_inbox.by_risk.medium} accent="text-amber-400" />
                <Stat label="high"   value={data.approval_inbox.by_risk.high}   accent="text-orange-400" />
                <Stat label="critical" value={data.approval_inbox.by_risk.critical}
                  accent={data.approval_inbox.by_risk.critical > 0 ? 'text-red-400' : 'text-emerald-400'} />
              </div>
              {data.approval_inbox.recent.length > 0 ? (
                <div className="space-y-1.5">
                  {data.approval_inbox.recent.map(r => (
                    <Link key={r.id} href="/approvals"
                      className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <code className="font-mono px-1 rounded text-[9px] uppercase"
                        style={{
                          background: r.risk_label === 'critical' ? 'rgba(248,113,113,0.12)'
                            : r.risk_label === 'high'     ? 'rgba(251,146,60,0.12)'
                            : r.risk_label === 'medium'   ? 'rgba(251,191,36,0.12)'
                            : 'rgba(52,211,153,0.12)',
                          color: r.risk_label === 'critical' ? '#f87171'
                            : r.risk_label === 'high'     ? '#fb923c'
                            : r.risk_label === 'medium'   ? '#fbbf24'
                            : '#34d399',
                        }}>
                        {r.risk_label}
                      </code>
                      <span style={{ color: 'var(--text-primary)' }}>{r.title || r.action_type}</span>
                      <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {r.requested_by} · {new Date(r.created_at).toLocaleTimeString('zh-CN')}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-muted)' }}>
                  ✨ 没有待审批 — 所有动作都已自动放行或刚好处理完。
                </p>
              )}
            </div>
          )}

          {/* Tool Autonomy Status */}
          {data.tool_autonomy && (
            <div className="glass rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-3 text-emerald-400">
                <Activity size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">Tool Autonomy</span>
                <Link href="/tools/autonomy" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
                  详情 <ExternalLink size={9} />
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <Stat label="7d 工具运行" value={data.tool_autonomy.runs_7d} />
                <Stat label="24h 失败" value={data.tool_autonomy.failed_24h}
                  accent={data.tool_autonomy.failed_24h > 0 ? 'text-red-400' : 'text-emerald-400'} />
                <Stat label="阻塞队列" value={data.tool_autonomy.blocked_or_pending}
                  accent={data.tool_autonomy.blocked_or_pending > 0 ? 'text-amber-400' : 'text-emerald-400'} />
                <Stat label="模型 providers" value={data.tool_autonomy.model_usage.length} accent="text-violet-400" />
              </div>
              {data.tool_autonomy.model_usage.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[10px] mb-2">
                  {data.tool_autonomy.model_usage.map(u => (
                    <code key={u.provider}
                      className="px-2 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                      {u.provider}: {u.runs} runs · {(u.input_tokens + u.output_tokens).toLocaleString()} tok
                    </code>
                  ))}
                </div>
              )}
              {data.tool_autonomy.recent_failures.length > 0 && (
                <div className="text-[10px] mt-2 pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  最近失败：{data.tool_autonomy.recent_failures.slice(0, 2).map(f => f.action).join(', ')}
                </div>
              )}
            </div>
          )}

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
                  <p className="text-xs mb-2" style={{ color: 'var(--text-primary)' }}>从聊一句话开始你的第一个 venture</p>
                  <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
                    AI 联合创始人会起草 System / Project / 任务 / 预算 / 汇报节奏，你审一遍就开干。
                  </p>
                  <Link href="/new-venture"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                    style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
                    <Sparkles size={11} /> 启动新 Venture
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.system_matrix.map(s => (
                    <Link key={s.id} href={`/systems/${s.id}`}
                      className="block text-xs p-2 rounded-lg hover:bg-white/5 transition-colors"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                          style={{
                            background: s.status === 'active' ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.12)',
                            color: s.status === 'active' ? '#34d399' : '#94a3b8',
                          }}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {s.project_count} 个项目
                      </p>
                    </Link>
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
