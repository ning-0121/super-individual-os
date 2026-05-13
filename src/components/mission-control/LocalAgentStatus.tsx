'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Laptop, ExternalLink, Wifi, WifiOff, ShieldCheck, ShieldX } from 'lucide-react'

interface SessionRow {
  id: string
  hostname: string | null
  os: string | null
  cursor_version: string | null
  capabilities: string[] | null
  status: string
  last_heartbeat: string | null
  derived_status: 'online' | 'offline' | 'error'
}

interface RecentRun {
  id: string
  action: string
  status: string
  started_at: string
  error_message: string | null
}

interface Payload {
  online_count: number
  sessions: SessionRow[]
  capabilities: { allowed: string[]; blocked: string[] }
  recent_runs: RecentRun[]
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - Date.parse(iso)
  if (isNaN(ms)) return '—'
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const DOT: Record<string, string> = {
  online:  '#34d399',
  offline: '#94a3b8',
  error:   '#f87171',
}

export default function LocalAgentStatus() {
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    fetch('/api/local-agent/status').then(r => r.ok ? r.json() : null)
      .then(setData).catch(() => {})
  }, [])

  if (!data) return null

  const top = data.sessions[0]
  const overall: 'online' | 'offline' | 'error' =
    data.online_count > 0 ? 'online'
    : data.sessions.some(s => s.derived_status === 'error') ? 'error'
    : 'offline'

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-orange-400">
        <Laptop size={12} />
        <span className="text-xs font-semibold uppercase tracking-wider">Local Agent · V0 只读</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px]"
          style={{ color: DOT[overall] }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: DOT[overall] }} />
          {overall === 'online' ? '在线' : overall === 'error' ? '错误' : '离线'}
        </span>
        <Link href="/tools/autonomy" className="text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
          管理 <ExternalLink size={9} />
        </Link>
      </div>

      {!top ? (
        <div className="text-[10px] text-center py-3" style={{ color: 'var(--text-muted)' }}>
          还没有本地 agent 注册。
          <br />
          打开桌面端 → 拷贝 token → 在 <Link href="/tools/autonomy" className="text-[var(--accent-light)]">/tools/autonomy</Link> 注册
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px]">
            {top.derived_status === 'online'
              ? <Wifi size={11} className="text-emerald-400" />
              : <WifiOff size={11} className="text-slate-400" />}
            <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
              {top.hostname ?? top.id.slice(0, 8)}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {top.os ?? ''} {top.cursor_version ? `· cursor ${top.cursor_version}` : ''}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {ago(top.last_heartbeat)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg p-2"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <div className="flex items-center gap-1 mb-1 text-emerald-400">
                <ShieldCheck size={9} />
                <span>允许的只读动作 ({data.capabilities.allowed.length})</span>
              </div>
              <div className="font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {data.capabilities.allowed.slice(0, 4).join(', ')}
                {data.capabilities.allowed.length > 4 ? ' …' : ''}
              </div>
            </div>
            <div className="rounded-lg p-2"
              style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <div className="flex items-center gap-1 mb-1 text-red-400">
                <ShieldX size={9} />
                <span>V0 拒绝 ({data.capabilities.blocked.length})</span>
              </div>
              <div className="font-mono leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {data.capabilities.blocked.slice(0, 4).join(', ')}
                {data.capabilities.blocked.length > 4 ? ' …' : ''}
              </div>
            </div>
          </div>

          {data.recent_runs.length > 0 && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                最近请求
              </p>
              <div className="space-y-0.5">
                {data.recent_runs.slice(0, 3).map(r => (
                  <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                    <code className="font-mono px-1 rounded"
                      style={{
                        background: r.status === 'success' ? 'rgba(52,211,153,0.12)'
                          : r.status === 'error' ? 'rgba(248,113,113,0.12)'
                          : 'rgba(148,163,184,0.12)',
                        color: r.status === 'success' ? '#34d399'
                          : r.status === 'error' ? '#f87171' : '#94a3b8',
                      }}>
                      {r.action.replace(/^local_agent\./, '')}
                    </code>
                    <span style={{ color: 'var(--text-muted)' }}>{r.status}</span>
                    <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                      {ago(r.started_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
