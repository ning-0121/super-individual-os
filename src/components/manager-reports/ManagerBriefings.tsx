'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, Bot, Sparkles, AlertTriangle, CheckCircle2, ExternalLink,
  Plus, X, Eye,
} from 'lucide-react'

interface Report {
  id: string
  role: string
  report_type: string
  title: string
  summary: string
  blockers: string[]
  risks: string[]
  next_actions: string[]
  confidence_score: number
  needs_user_intervention: boolean
  project_id: string | null
  read_at: string | null
  generated_at: string
  // V2.9 — workflow runtime surface
  metrics?: {
    active_workflows?: number
    blocked_workflows?: number
    bottleneck_step?: string | null
    next_workflow_action?: string | null
  }
}

const ROLE_META: Record<string, { label: string; emoji: string; color: string }> = {
  ceo:                 { label: 'CEO', emoji: '👑', color: 'text-red-400' },
  engineering_manager: { label: 'CTO', emoji: '⚙️',  color: 'text-emerald-400' },
  qa_manager:          { label: 'QA',  emoji: '🧪', color: 'text-cyan-400' },
  design_manager:      { label: 'CPO', emoji: '🎨', color: 'text-violet-400' },
  growth_manager:      { label: 'CGO', emoji: '📈', color: 'text-pink-400' },
  finance_manager:     { label: 'COO', emoji: '🛠',  color: 'text-amber-400' },
  risk_manager:        { label: 'CSO', emoji: '🧭', color: 'text-orange-400' },
}

const FEATURED_ROLES = [
  'ceo', 'engineering_manager', 'finance_manager', 'growth_manager', 'design_manager',
] as const

interface Props {
  // When set, only display reports for this role (used inside Copilot panel)
  filterRole?: string
  compact?: boolean
}

export default function ManagerBriefings({ filterRole, compact }: Props) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = '/api/manager-reports' + (filterRole ? `?role=${filterRole}` : '')
    const r = await fetch(url)
    if (r.ok) {
      const d = await r.json()
      setReports(d.reports ?? [])
    }
    setLoading(false)
  }, [filterRole])

  useEffect(() => { load() }, [load])

  async function generateAll() {
    setGenerating(true)
    await fetch('/api/manager-reports/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all_roles: true, report_type: 'daily' }),
    })
    setGenerating(false)
    load()
  }

  async function generateForRole(role: string) {
    setGenerating(true)
    await fetch('/api/manager-reports/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, report_type: 'daily' }),
    })
    setGenerating(false)
    load()
  }

  async function markRead(id: string) {
    await fetch(`/api/manager-reports/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read' }),
    })
    load()
  }

  async function convertToTask(report: Report) {
    if (!report.project_id) {
      alert('该报告没有关联项目，无法直接转任务。请先把报告挂到具体项目。')
      return
    }
    const title = prompt('任务标题（默认使用第一条 next_action）：',
      report.next_actions[0] ?? `处理 ${ROLE_META[report.role]?.label} 报告`)
    if (!title) return
    const r = await fetch(`/api/manager-reports/${report.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'convert_to_task', task: { title } }),
    })
    if (r.ok) alert('✅ 任务已创建。可在 /tasks 查看')
    else      alert('转任务失败')
  }

  // Group: latest report per role for the header strip
  const latestByRole = new Map<string, Report>()
  for (const r of reports) {
    if (!latestByRole.has(r.role)) latestByRole.set(r.role, r)
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-5 mb-4 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-violet-400" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>正在加载经理简报…</span>
      </div>
    )
  }

  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-3 text-violet-400">
        <Bot size={13} />
        <span className="text-xs font-semibold uppercase tracking-wider">Manager Briefings</span>
        <button onClick={generateAll} disabled={generating}
          className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg disabled:opacity-40 hover:bg-white/5"
          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          {generating ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
          {generating ? '生成中...' : '让所有经理汇报'}
        </button>
      </div>

      {/* Corporate-exec briefing cards (V2.7) */}
      {!compact && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          {FEATURED_ROLES.map(role => {
            const r = latestByRole.get(role)
            const meta = ROLE_META[role]
            const status = !r
              ? { label: '无报告',  color: '#94a3b8', bg: 'var(--bg-base)',           border: 'var(--border)' }
              : r.needs_user_intervention
                ? { label: '阻塞', color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.3)' }
                : r.blockers.length > 0
                  ? { label: '需关注', color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.28)' }
                  : { label: '正常', color: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.28)' }
            return (
              <div key={role} className="rounded-lg p-2.5 flex flex-col"
                style={{ background: status.bg, border: `1px solid ${status.border}` }}>

                {/* role + status row */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>
                  <span className="ml-auto text-[8px] font-mono px-1 rounded uppercase"
                    style={{ background: `${status.color}20`, color: status.color }}>
                    {status.label}
                  </span>
                </div>

                {r ? (
                  <>
                    {/* biggest risk */}
                    {r.blockers.length > 0 || r.risks.length > 0 ? (
                      <p className="text-[10px] mb-1 line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                        <span className="text-amber-400">⚠ </span>
                        {r.blockers[0] ?? r.risks[0]}
                      </p>
                    ) : (
                      <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>无风险</p>
                    )}
                    {/* next action */}
                    {r.next_actions.length > 0 && (
                      <p className="text-[10px] mb-1.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        <span className="text-cyan-400">→ </span>
                        {r.next_actions[0]}
                      </p>
                    )}
                    {/* V2.9 — workflow indicators */}
                    {(r.metrics?.active_workflows ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        <span className="text-[8px] px-1 py-0.5 rounded font-mono text-cyan-400"
                          style={{ background: 'rgba(34,211,238,0.08)' }}>
                          {r.metrics?.active_workflows} active wf
                        </span>
                        {(r.metrics?.blocked_workflows ?? 0) > 0 && (
                          <span className="text-[8px] px-1 py-0.5 rounded font-mono text-amber-400"
                            style={{ background: 'rgba(251,191,36,0.08)' }}>
                            {r.metrics?.blocked_workflows} blocked
                          </span>
                        )}
                      </div>
                    )}
                    {r.metrics?.bottleneck_step && (
                      <p className="text-[9px] mb-1.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                        bottleneck: <code className="font-mono text-amber-400">{r.metrics.bottleneck_step}</code>
                      </p>
                    )}
                    {/* CEO chip + actions */}
                    <div className="flex items-center gap-1 mt-auto">
                      {r.needs_user_intervention && (
                        <span className="text-[8px] px-1 py-0.5 rounded text-red-400 uppercase"
                          style={{ background: 'rgba(248,113,113,0.12)' }}>需 CEO</span>
                      )}
                      <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="ml-auto text-[9px] text-[var(--accent-light)] hover:underline">
                        {expandedId === r.id ? '收起' : '查看 →'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => generateForRole(role)}
                    disabled={generating}
                    className="text-[10px] text-[var(--accent-light)] inline-flex items-center gap-0.5 mt-auto self-start hover:underline disabled:opacity-40">
                    <Plus size={8} /> 生成报告
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Expanded card list */}
      {(expandedId || compact) && (
        <div className="space-y-2 mt-2">
          {reports
            .filter(r => compact || r.id === expandedId)
            .slice(0, compact ? 5 : 1)
            .map(r => (
              <ReportCard key={r.id} report={r}
                onMarkRead={() => markRead(r.id)}
                onConvertToTask={() => convertToTask(r)}
                onClose={compact ? undefined : () => setExpandedId(null)} />
            ))}
        </div>
      )}

      {!compact && reports.length === 0 && (
        <div className="text-center py-4">
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            还没有经理报告。
          </p>
          <button onClick={generateAll} disabled={generating}
            className="inline-flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
            <Sparkles size={9} /> {generating ? '生成中...' : '让所有经理生成首份简报'}
          </button>
        </div>
      )}
    </div>
  )
}

function ReportCard({ report, onMarkRead, onConvertToTask, onClose }: {
  report: Report
  onMarkRead: () => void
  onConvertToTask: () => void
  onClose?: () => void
}) {
  const meta = ROLE_META[report.role] ?? { label: report.role, emoji: '🤖', color: 'text-violet-400' }
  const isUnread = !report.read_at
  return (
    <div className="rounded-lg p-3 relative"
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        ...(isUnread ? { borderLeft: '3px solid #a78bfa' } : {}),
      }}>
      {onClose && (
        <button onClick={onClose}
          className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          <X size={12} />
        </button>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm">{meta.emoji}</span>
        <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
        <code className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
          {report.report_type}
        </code>
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          confidence {Math.round(report.confidence_score * 100)}%
        </span>
        {report.needs_user_intervention && (
          <span className="text-[9px] px-1.5 py-0.5 rounded text-red-400"
            style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)' }}>
            需 CEO 介入
          </span>
        )}
        <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {new Date(report.generated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-[11px] mb-2" style={{ color: 'var(--text-primary)' }}>
        {report.summary}
      </p>

      {report.blockers.length > 0 && (
        <Section title="阻塞" color="text-amber-400" items={report.blockers} />
      )}
      {report.risks.length > 0 && (
        <Section title="风险" color="text-orange-400" items={report.risks} />
      )}
      {report.next_actions.length > 0 && (
        <Section title="下一步" color="text-cyan-400" items={report.next_actions} />
      )}

      <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={onConvertToTask}
          className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded text-cyan-400 hover:bg-white/5"
          style={{ border: '1px solid var(--border)' }}>
          <Plus size={9} /> 转任务
        </button>
        <button onClick={onMarkRead} disabled={!isUnread}
          className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded disabled:opacity-40"
          style={{ border: '1px solid var(--border)', color: isUnread ? 'var(--accent-light)' : 'var(--text-muted)' }}>
          <Eye size={9} /> {isUnread ? '标记已读' : '已读'}
        </button>
        {report.project_id && (
          <Link href={`/projects/${report.project_id}`}
            className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
            进入项目 <ExternalLink size={9} />
          </Link>
        )}
      </div>
    </div>
  )
}

function Section({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div className="mb-1.5">
      <p className={`text-[9px] uppercase tracking-wider mb-0.5 ${color}`}>{title}</p>
      <ul className="text-[10px] space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
        {items.map((it, i) => <li key={i}>· {it}</li>)}
      </ul>
    </div>
  )
}
