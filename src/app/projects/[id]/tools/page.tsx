'use client'
import { useEffect, useState, use } from 'react'
import { Loader2, GitBranch, Database, Rocket, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

interface ToolRow {
  tool_integration_id: string
  tool_name: string
  tool_type: string
  auth_status: string
  is_active: boolean
  config: Record<string, unknown>
  grant: { is_enabled: boolean; default_config_override: Record<string, unknown> } | null
}

const ICON: Record<string, typeof GitBranch> = { github: GitBranch, supabase: Database, vercel: Rocket }

export default function ProjectToolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [rows, setRows] = useState<ToolRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/projects/${projectId}/tools`)
    if (r.ok) setRows(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function toggle(row: ToolRow, enable: boolean) {
    setPendingId(row.tool_integration_id)
    await fetch(`/api/projects/${projectId}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_integration_id: row.tool_integration_id, is_enabled: enable }),
    })
    await load()
    setPendingId(null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-[var(--text-muted)] text-sm mb-3">尚未连接任何工具</p>
        <a href="/tools" className="text-[var(--accent-light)] text-xs hover:text-white transition-colors">
          → 前往全局 Tools 页连接 GitHub / Supabase / Vercel
        </a>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="glass rounded-xl p-4 mb-4 flex items-start gap-2"
        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          这里只显示<strong className="text-[var(--accent-light)]">本项目可使用的工具</strong>。
          关闭某个工具后，本项目的 Agent 调用将拒绝该工具。
          没有 grant 的工具默认启用（继承全局连接状态）。
        </p>
      </div>

      <div className="space-y-2">
        {rows.map(r => {
          const Icon = ICON[r.tool_name] ?? GitBranch
          const effectivelyEnabled = r.grant ? r.grant.is_enabled : true
          const connected = r.auth_status === 'connected' && r.is_active
          return (
            <div key={r.tool_integration_id} className="glass rounded-xl p-4 flex items-center gap-4">
              <Icon size={16} className={effectivelyEnabled && connected ? 'text-emerald-400' : 'text-slate-400'} />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{r.tool_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {connected ? (
                    <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                      <CheckCircle2 size={9} /> 全局已连接
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] text-red-400">
                      <XCircle size={9} /> 全局未连接
                    </span>
                  )}
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>·</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {r.grant ? '本项目已 grant' : '继承全局 (默认启用)'}
                  </span>
                </div>
              </div>
              <button onClick={() => toggle(r, !effectivelyEnabled)} disabled={!connected || pendingId === r.tool_integration_id}
                className="text-[10px] px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
                style={{
                  background: effectivelyEnabled ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.08)',
                  border: `1px solid ${effectivelyEnabled ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
                  color: effectivelyEnabled ? '#34d399' : 'var(--text-muted)',
                }}>
                {pendingId === r.tool_integration_id ? <Loader2 size={9} className="animate-spin" /> : (effectivelyEnabled ? '本项目启用' : '本项目禁用')}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-6">
        <a href="/tools" className="flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-muted)' }}>
          <ExternalLink size={11} /> 管理工具连接（全局 token / 凭证）
        </a>
      </div>
    </div>
  )
}
