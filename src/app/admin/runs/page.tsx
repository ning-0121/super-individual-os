'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, ShieldAlert, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react'

interface AdminRun {
  id: string
  user_id: string
  user_email: string
  task_id: string
  task_title: string
  agent_name: string
  agent_avatar: string
  agent_type: string
  run_status: string
  retry_count: number
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_message: string
}

const STATUS_COLOR: Record<string, string> = {
  queued: '#94a3b8', pending: '#94a3b8',
  running: '#fbbf24',
  succeeded: '#34d399', completed: '#34d399',
  failed: '#f87171',
  cancelled: '#94a3b8',
}

export default function AdminRunsPage() {
  const [runs, setRuns] = useState<AdminRun[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/runs?limit=100')
    if (r.status === 403) { setForbidden(true); setLoading(false); return }
    if (r.ok) setRuns(await r.json())
    setLoading(false)
  }

  const filtered = filterStatus === 'all' ? runs : runs.filter(r => r.run_status === filterStatus)
  const counts = {
    total: runs.length,
    succeeded: runs.filter(r => ['succeeded', 'completed'].includes(r.run_status)).length,
    failed: runs.filter(r => r.run_status === 'failed').length,
    running: runs.filter(r => ['running', 'queued', 'pending'].includes(r.run_status)).length,
    users: new Set(runs.map(r => r.user_id)).size,
  }

  if (forbidden) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="glass-strong rounded-xl p-8 max-w-md text-center" style={{ border: '1px solid rgba(248,113,113,0.3)' }}>
            <ShieldAlert size={32} className="mx-auto mb-3 text-red-400" />
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>权限不足</h2>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              此页面仅限管理员访问。请把你的 user_id 加入 <code className="text-[var(--accent-light)]">ADMIN_USER_IDS</code> 环境变量。
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-red-400 tracking-widest uppercase mb-0.5">Admin · System View</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>所有用户的执行记录</h1>
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} /> 刷新
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-6xl">

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            {[
              { label: '总计',    value: counts.total,    color: 'text-[var(--accent-light)]' },
              { label: '成功',    value: counts.succeeded,color: 'text-emerald-400' },
              { label: '失败',    value: counts.failed,   color: 'text-red-400' },
              { label: '执行中',  value: counts.running,  color: 'text-amber-400' },
              { label: '用户数',  value: counts.users,    color: 'text-violet-400' },
            ].map(s => (
              <div key={s.label} className="glass rounded-xl p-3">
                <p className={`text-2xl font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[9px] mt-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-2 mb-4">
            {['all', 'succeeded', 'failed', 'running'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className="text-[10px] px-2.5 py-1 rounded-lg transition-all"
                style={{
                  border: `1px solid ${filterStatus === s ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: filterStatus === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: filterStatus === s ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>
                {s === 'all' ? '全部' : s === 'succeeded' ? '成功' : s === 'failed' ? '失败' : '执行中'}
              </button>
            ))}
          </div>

          {loading && <p className="text-center py-12 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-center py-12 text-[var(--text-muted)] text-sm">暂无数据</p>
          )}

          {/* Table */}
          {!loading && filtered.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead style={{ background: 'var(--bg-elevated)' }}>
                  <tr>
                    {['用户', '任务', 'Agent', '状态', '步数', '耗时', '时间', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const color = STATUS_COLOR[r.run_status] ?? '#94a3b8'
                    const dur = r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : '—'
                    return (
                      <tr key={r.id} className="hover:bg-white/3" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }} title={r.user_email}>
                          {r.user_email}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }} title={r.task_title}>
                          {r.task_title}
                        </td>
                        <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                          {r.agent_avatar} {r.agent_name}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                            {r.run_status}
                          </span>
                          {r.retry_count > 0 && (
                            <span className="text-[9px] ml-1.5 text-amber-400">↻{r.retry_count}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {dur}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {/* slot empty - kept for future agent type */}
                          {r.agent_type}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(r.started_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2">
                          <a href={`/task-runs/${r.id}`}
                            className="text-[10px] flex items-center gap-1"
                            style={{ color: 'var(--accent-light)' }}>
                            详情 <ExternalLink size={9} />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent failures highlight */}
          {!loading && counts.failed > 0 && filterStatus === 'all' && (
            <div className="glass rounded-xl p-4 mt-4" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <AlertTriangle size={11} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">最近失败摘要</span>
              </div>
              <div className="space-y-1">
                {runs.filter(r => r.run_status === 'failed').slice(0, 5).map(r => (
                  <p key={r.id} className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    [{r.user_email}] {r.error_message || '(no message)'}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
