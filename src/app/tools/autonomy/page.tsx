'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, Wrench, Cpu, ShieldAlert, Bot, Activity, RefreshCw,
} from 'lucide-react'

interface Capability {
  tool: string; action: string; risk_level: number
  manager_role?: string; require_qa: boolean; require_ceo: boolean; description: string
}

interface LocalRun {
  id: string; action: string; status: string
  started_at: string; finished_at?: string | null
  error_message: string | null
  result?: Record<string, unknown> | null
}
interface LocalAgentStatusData {
  online_count: number
  sessions: Array<{ id: string; hostname: string | null; os: string | null; cursor_version: string | null; status: string; last_heartbeat: string | null; derived_status: 'online' | 'offline' | 'error'; capabilities: string[] | null }>
  capabilities: { allowed: string[]; blocked: string[] }
  recent_runs: LocalRun[]
  pending: LocalRun[]
  last_success: LocalRun | null
  last_error: LocalRun | null
}

interface AutonomyData {
  capabilities: Capability[]
  connected_tools: string[]
  available_providers: string[]
  recent_tool_runs: Array<{ id: string; tool: string; action: string; status: string; risk_level: number; started_at: string; duration_ms: number; error_message: string | null }>
  blocked_tool_runs: Array<{ id: string; action: string; status: string; risk_level: number; started_at: string; required_approvers: string[] }>
  model_usage: Array<{ provider: string; runs: number; input_tokens: number; output_tokens: number }>
  recent_model_runs: Array<{ provider: string; model: string; agent_type: string | null; input_tokens: number; output_tokens: number; duration_ms: number; status: string; created_at: string }>
  local_agents: Array<{ id: string; hostname: string; os: string; status: string; last_heartbeat: string; capabilities: string[] }>
  generated_at: string
}

const RISK_COLOR: Record<number, string> = {
  0: '#94a3b8', 1: '#22d3ee', 2: '#fbbf24', 3: '#fb923c', 4: '#f87171',
}

const STATUS_COLOR: Record<string, string> = {
  success: '#34d399', error: '#f87171', blocked: '#fb923c', pending_approval: '#fbbf24',
}

export default function ToolAutonomyPage() {
  const [data, setData] = useState<AutonomyData | null>(null)
  const [laStatus, setLaStatus] = useState<LocalAgentStatusData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [r, rLA] = await Promise.all([
      fetch('/api/tool-autonomy'),
      fetch('/api/local-agent/status'),
    ])
    if (r.ok) setData(await r.json())
    if (rLA.ok) setLaStatus(await rLA.json())
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

  const byTool = new Map<string, Capability[]>()
  for (const c of data.capabilities) {
    const arr = byTool.get(c.tool) ?? []
    arr.push(c); byTool.set(c.tool, arr)
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-emerald-400 tracking-widest uppercase mb-0.5">Tool Layer</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tool Autonomy</h1>
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} /> 刷新
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-6xl">

          {/* Top stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="已连接工具" value={data.connected_tools.length} accent="text-emerald-400" />
            <Stat label="可用 Providers" value={data.available_providers.length} accent="text-cyan-400" />
            <Stat label="7d 工具运行" value={data.recent_tool_runs.length} />
            <Stat label="阻塞队列" value={data.blocked_tool_runs.length} accent={data.blocked_tool_runs.length > 0 ? 'text-amber-400' : 'text-emerald-400'} />
          </div>

          {/* Connected tools */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-emerald-400">
              <Wrench size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Connected Tools</span>
            </div>
            {data.connected_tools.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>尚未连接任何工具 — 在 /tools 页面添加</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.connected_tools.map(t => (
                  <code key={t} className="text-[10px] px-2 py-1 rounded font-mono"
                    style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                    {t}
                  </code>
                ))}
              </div>
            )}
          </div>

          {/* Capabilities by tool */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-cyan-400">
              <ShieldAlert size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Capabilities ({data.capabilities.length})</span>
            </div>
            <div className="space-y-3">
              {Array.from(byTool.entries()).map(([tool, caps]) => (
                <div key={tool}>
                  <p className="text-[10px] uppercase font-mono tracking-wider mb-1.5"
                    style={{ color: 'var(--text-muted)' }}>{tool}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {caps.map(c => (
                      <div key={c.action} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                        <span className="font-mono px-1.5 py-0.5 rounded text-[9px]"
                          style={{ background: `${RISK_COLOR[c.risk_level]}20`, color: RISK_COLOR[c.risk_level] }}>
                          L{c.risk_level}
                        </span>
                        <code className="font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>{c.action}</code>
                        {c.require_ceo && <span className="ml-auto text-[9px] text-red-400">CEO</span>}
                        {!c.require_ceo && c.require_qa && <span className="ml-auto text-[9px] text-cyan-400">+QA</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Blocked / pending approval */}
          {data.blocked_tool_runs.length > 0 && (
            <div className="glass rounded-xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-3 text-amber-400">
                <ShieldAlert size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">Blocked / Pending Approval</span>
              </div>
              <div className="space-y-1.5">
                {data.blocked_tool_runs.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <code style={{ color: 'var(--text-primary)' }}>{r.action}</code>
                    <span className="font-mono px-1 rounded text-[9px]"
                      style={{ background: `${RISK_COLOR[r.risk_level]}20`, color: RISK_COLOR[r.risk_level] }}>
                      L{r.risk_level}
                    </span>
                    <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {r.required_approvers.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent tool runs */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-[var(--accent-light)]">
              <Activity size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Recent Tool Runs (7d)</span>
            </div>
            {data.recent_tool_runs.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>过去 7 天没有工具调用</p>
            ) : (
              <div className="space-y-1">
                {data.recent_tool_runs.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <span className="font-mono px-1 rounded text-[9px]"
                      style={{ background: `${STATUS_COLOR[r.status]}20`, color: STATUS_COLOR[r.status] }}>
                      {r.status}
                    </span>
                    <code style={{ color: 'var(--text-primary)' }}>{r.action}</code>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.duration_ms}ms</span>
                    <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(r.started_at).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model usage */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-violet-400">
              <Cpu size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Model Usage (7d)</span>
            </div>
            {data.model_usage.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>无模型调用记录</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {data.model_usage.map(u => (
                  <div key={u.provider} className="rounded-lg p-3"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-primary)' }}>{u.provider}</p>
                    <p className="text-2xl font-mono text-violet-400">{u.runs}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      in {u.input_tokens.toLocaleString()} · out {u.output_tokens.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Local Agent V0 — read-only handshake */}
          <div className="glass rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3 text-orange-400">
              <Bot size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">Local Agent · V0 只读</span>
              {laStatus && (
                <span className="ml-auto text-[10px] inline-flex items-center gap-1"
                  style={{ color: laStatus.online_count > 0 ? '#34d399' : '#94a3b8' }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: laStatus.online_count > 0 ? '#34d399' : '#94a3b8' }} />
                  {laStatus.online_count} 在线
                </span>
              )}
            </div>

            <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
              V0 只允许 <span className="text-emerald-400">读操作</span>（git_status, list_directory, ...）。
              任何写文件 / shell / push / 部署都会被拒绝，原因 <code className="font-mono">V0 only supports read-only local actions</code>。
            </p>

            {/* Allowed vs blocked capabilities */}
            {laStatus && (
              <div className="grid grid-cols-2 gap-2 mb-3 text-[10px]">
                <div className="rounded-lg p-2"
                  style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)' }}>
                  <p className="text-emerald-400 mb-1 font-semibold">允许（{laStatus.capabilities.allowed.length}）</p>
                  <div className="flex flex-wrap gap-1">
                    {laStatus.capabilities.allowed.map(a => (
                      <code key={a} className="font-mono px-1 rounded"
                        style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>{a}</code>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg p-2"
                  style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <p className="text-red-400 mb-1 font-semibold">V0 拒绝（{laStatus.capabilities.blocked.length}）</p>
                  <div className="flex flex-wrap gap-1">
                    {laStatus.capabilities.blocked.map(a => (
                      <code key={a} className="font-mono px-1 rounded"
                        style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>{a}</code>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sessions */}
            {(!laStatus || laStatus.sessions.length === 0) ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                尚无本地 Agent — 通过 POST /api/local-agent/register 注册（桌面客户端 V2.3+）
              </p>
            ) : (
              <div className="space-y-1.5">
                {laStatus.sessions.map(a => (
                  <div key={a.id} className="text-[11px] p-2 rounded-lg"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{
                          background: a.derived_status === 'online' ? '#34d399'
                            : a.derived_status === 'error' ? '#f87171' : '#94a3b8',
                        }} />
                      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                        {a.hostname || '(unnamed)'}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>· {a.os ?? ''} {a.cursor_version ? `· cursor ${a.cursor_version}` : ''}</span>
                      <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {a.derived_status} · {a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleTimeString('zh-CN') : 'never'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending requests / last result / last error */}
            {laStatus && (laStatus.pending.length > 0 || laStatus.last_success || laStatus.last_error) && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="rounded-lg p-2"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">
                    pending ({laStatus.pending.length})
                  </p>
                  {laStatus.pending.length === 0 ? (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>队列为空</p>
                  ) : (
                    laStatus.pending.slice(0, 3).map(r => (
                      <code key={r.id} className="block font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {r.action.replace(/^local_agent\./, '')}
                      </code>
                    ))
                  )}
                </div>
                <div className="rounded-lg p-2"
                  style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.25)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">last success</p>
                  {laStatus.last_success ? (
                    <>
                      <code className="block font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>
                        {laStatus.last_success.action.replace(/^local_agent\./, '')}
                      </code>
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        {laStatus.last_success.finished_at ? new Date(laStatus.last_success.finished_at).toLocaleString('zh-CN') : '—'}
                      </p>
                    </>
                  ) : (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>尚无成功记录</p>
                  )}
                </div>
                <div className="rounded-lg p-2"
                  style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-red-400 mb-1">last error</p>
                  {laStatus.last_error ? (
                    <>
                      <code className="block font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>
                        {laStatus.last_error.action.replace(/^local_agent\./, '')}
                      </code>
                      <p className="text-[9px] line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                        {laStatus.last_error.error_message ?? ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>没有错误</p>
                  )}
                </div>
              </div>
            )}

            {/* Recent local-agent runs */}
            {laStatus && laStatus.recent_runs.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  最近 local_agent 请求
                </p>
                <div className="space-y-1">
                  {laStatus.recent_runs.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-[10px]">
                      <code className="font-mono px-1 rounded"
                        style={{
                          background: r.status === 'success' ? 'rgba(52,211,153,0.12)'
                            : r.status === 'error' ? 'rgba(248,113,113,0.12)'
                            : 'rgba(148,163,184,0.12)',
                          color: r.status === 'success' ? '#34d399'
                            : r.status === 'error' ? '#f87171' : '#94a3b8',
                        }}>{r.status}</code>
                      <code style={{ color: 'var(--text-primary)' }}>{r.action}</code>
                      <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                        {new Date(r.started_at).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-2xl font-mono ${accent ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}
