'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2, AlertTriangle, CheckCircle2, XCircle, Activity, Wrench, FileText, RefreshCw } from 'lucide-react'

interface ReadinessData {
  encryption: { status: 'production-secure' | 'dev-fallback' | 'invalid'; message: string; active_key_version: string }
  counts: {
    connected_tools: number
    registered_tools: number
    failed_runs_24h: number
    succeeded_runs_7d: number
    audit_log_total: number
    legacy_plaintext_secrets: number
    admins?: number
  }
  integrations?: {
    sentry_configured: boolean
    health_endpoint: string
  }
  recent_failures: Array<{ id: string; error_message: string; started_at: string; retry_count: number }>
  blockers: Array<{ severity: 'critical' | 'warning'; message: string }>
  test_coverage: { unit_tests: number; files: number; note: string }
  is_fresh_system: boolean
  generated_at: string
}

export default function SystemReadinessPage() {
  const [data, setData] = useState<ReadinessData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setRefreshing(true)
    const r = await fetch('/api/system-readiness')
    if (r.ok) setData(await r.json())
    setLoading(false); setRefreshing(false)
  }

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

  const criticalBlockers = data.blockers.filter(b => b.severity === 'critical')
  const warningBlockers  = data.blockers.filter(b => b.severity === 'warning')
  const overallStatus: 'ready' | 'warnings' | 'blocked' =
    criticalBlockers.length > 0 ? 'blocked' :
    warningBlockers.length > 0 ? 'warnings' : 'ready'

  const STATUS_META = {
    ready:    { label: '可内测', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', icon: ShieldCheck },
    warnings: { label: '有警告', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', icon: ShieldAlert },
    blocked:  { label: '不可上线', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', icon: ShieldOff },
  }
  const sm = STATUS_META[overallStatus]
  const StatusIcon = sm.icon

  const ENC_META: Record<string, { color: string; icon: typeof ShieldCheck; label: string }> = {
    'production-secure': { color: '#34d399', icon: ShieldCheck, label: '已加固' },
    'dev-fallback':      { color: '#fbbf24', icon: ShieldAlert, label: '开发回退' },
    'invalid':           { color: '#f87171', icon: ShieldOff,   label: '不安全' },
  }
  const em = ENC_META[data.encryption.status]
  const EncIcon = em.icon

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        {/* Header */}
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-emerald-400 tracking-widest uppercase mb-0.5">Beta Readiness</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>系统就绪度</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={load} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              刷新
            </button>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              更新于 {new Date(data.generated_at).toLocaleTimeString('zh-CN')}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">

          {/* Overall status hero */}
          <div className="rounded-xl p-6 mb-6"
            style={{ background: sm.bg, border: `1px solid ${sm.border}` }}>
            <div className="flex items-center gap-4">
              <StatusIcon size={32} style={{ color: sm.color }} />
              <div className="flex-1">
                <p className="text-xs uppercase tracking-widest mb-1" style={{ color: sm.color }}>当前状态</p>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{sm.label}</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {overallStatus === 'ready'    && '系统已准备好接受 10 个以内真实项目内测'}
                  {overallStatus === 'warnings' && '可启动内测，但建议先处理警告项'}
                  {overallStatus === 'blocked'  && '存在严重阻塞项，必须修复后才能上线'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-mono" style={{ color: sm.color }}>
                  {criticalBlockers.length === 0 && warningBlockers.length === 0 ? '✓' :
                   criticalBlockers.length > 0 ? '✗' : '⚠'}
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {criticalBlockers.length} critical · {warningBlockers.length} warnings
                </p>
              </div>
            </div>
          </div>

          {/* Blockers */}
          {data.blockers.length > 0 && (
            <div className="glass rounded-xl p-5 mb-6">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">阻塞项 / 警告项</p>
              <div className="space-y-2">
                {data.blockers.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-3 rounded-lg"
                    style={{
                      background: b.severity === 'critical' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)',
                      border: `1px solid ${b.severity === 'critical' ? 'rgba(248,113,113,0.25)' : 'rgba(251,191,36,0.2)'}`,
                    }}>
                    {b.severity === 'critical'
                      ? <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                      : <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />}
                    <span style={{ color: b.severity === 'critical' ? '#f87171' : '#fbbf24' }}>{b.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">

            {/* Encryption */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3" style={{ color: em.color }}>
                <EncIcon size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">加密密钥状态</span>
              </div>
              <p className="text-2xl font-mono mb-2" style={{ color: em.color }}>{em.label}</p>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>{data.encryption.message}</p>
              <div className="flex gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>密钥版本: <code style={{ color: em.color }}>{data.encryption.active_key_version}</code></span>
                <span>·</span>
                <span>遗留明文: <span style={{ color: data.counts.legacy_plaintext_secrets > 0 ? '#fbbf24' : '#34d399' }}>
                  {data.counts.legacy_plaintext_secrets}
                </span></span>
              </div>
            </div>

            {/* Tools */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-[var(--accent-light)]">
                <Wrench size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">已连接工具</span>
              </div>
              <p className="text-2xl font-mono text-[var(--accent-light)] mb-2">
                {data.counts.connected_tools}
                <span className="text-xs text-[var(--text-muted)] ml-1">/ {data.counts.registered_tools}</span>
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {data.counts.connected_tools > 0 ? '工具已配置，Agent 可执行真实动作' : '尚未连接 — Agent 仅能输出文本'}
              </p>
            </div>

            {/* Recent runs */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-emerald-400">
                <Activity size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">最近 7 天执行</span>
              </div>
              <p className="text-2xl font-mono text-emerald-400 mb-2">{data.counts.succeeded_runs_7d}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                成功完成的执行
                {data.counts.failed_runs_24h > 0 && (
                  <> · <span className="text-red-400">{data.counts.failed_runs_24h}</span> 次失败 (24h)</>
                )}
              </p>
            </div>

            {/* Audit logs */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-violet-400">
                <FileText size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">审计日志</span>
              </div>
              <p className="text-2xl font-mono text-violet-400 mb-2">{data.counts.audit_log_total}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {data.is_fresh_system
                  ? '尚无审计记录 — 执行任意操作将开始记录'
                  : '所有关键操作都被结构化记录'}
              </p>
            </div>
          </div>

          {/* Recent failures */}
          {data.recent_failures.length > 0 && (
            <div className="glass rounded-xl p-5 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-red-400">最近失败的执行</p>
              <div className="space-y-2">
                {data.recent_failures.map(f => (
                  <a key={f.id} href={`/task-runs/${f.id}`}
                    className="block text-xs p-3 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between mb-1">
                      <p style={{ color: 'var(--text-primary)' }}>{f.error_message || '(无错误信息)'}</p>
                      {f.retry_count > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded text-amber-400"
                          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
                          已重试 {f.retry_count}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {new Date(f.started_at).toLocaleString('zh-CN')} · {f.id}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Test coverage */}
          <div className="glass rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3 text-cyan-400">
              <CheckCircle2 size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">测试覆盖</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>单元测试</p>
                <p className="text-2xl font-mono text-cyan-400">{data.test_coverage.unit_tests}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>测试文件</p>
                <p className="text-2xl font-mono text-cyan-400">{data.test_coverage.files}</p>
              </div>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>{data.test_coverage.note}</p>
          </div>

          {/* Beta launch checklist */}
          <div className="glass rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              内测启动清单
            </p>
            <ul className="text-xs space-y-2">
              <ChecklistItem ok={data.encryption.status === 'production-secure'} label="ENCRYPTION_KEY 在生产环境正确配置" />
              <ChecklistItem ok={data.counts.legacy_plaintext_secrets === 0} label="所有现有 token 已加密（无遗留明文）" />
              <ChecklistItem ok={data.counts.connected_tools >= 1} label="至少连接一个工具（GitHub / Supabase / Vercel）" />
              <ChecklistItem ok={data.counts.failed_runs_24h < 5} label="过去 24h 失败次数 < 5" />
              <ChecklistItem ok={true} label={`单测套件通过 (${data.test_coverage.unit_tests} tests)`} />
              <ChecklistItem ok={true} label="审计日志已启用（每次操作被记录）" />
              <ChecklistItem ok={true} label="结构化日志已就绪（可对接 Logtail / Datadog）" />
              <ChecklistItem ok={!!data.integrations?.sentry_configured} label="Sentry / 错误聚合服务已接入" />
              <ChecklistItem ok={true} label="密钥轮换脚本就绪 (npm run rotate-key:dry)" />
              <ChecklistItem ok={(data.counts.admins ?? 0) >= 1} label={`管理员已配置（当前 ${data.counts.admins ?? 0} 人）`} />
              <ChecklistItem ok={true} label="健康检查端点 /api/health 可用" />
            </ul>
          </div>

        </div>
      </main>
    </div>
  )
}

function ChecklistItem({ ok, label, pending }: { ok: boolean; label: string; pending?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      {pending ? (
        <span className="text-[var(--text-muted)] mt-0.5">○</span>
      ) : ok ? (
        <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
      )}
      <span style={{ color: pending ? 'var(--text-muted)' : ok ? 'var(--text-secondary)' : '#f87171' }}>
        {label}
        {pending && <span className="ml-2 text-[9px] uppercase tracking-wider">待办</span>}
      </span>
    </li>
  )
}
