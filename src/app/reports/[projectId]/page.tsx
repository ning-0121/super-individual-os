'use client'
import { useEffect, useState, use } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ArrowLeft, Loader2, FileText, CheckCircle2, AlertTriangle, Clock, Layers, Package, ExternalLink, GitBranch, Target, Activity, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ReportData {
  project: { id: string; name: string; description: string; goal_statement: string; status: string }
  stats: {
    total_tasks: number
    completed: number
    in_progress: number
    blocked: number
    revision_required: number
    not_started: number
    total_runs: number
    successful_runs: number
    failed_runs: number
    total_artifacts: number
    completion_pct: number
  }
  artifacts_by_type: Record<string, number>
  artifacts: Array<{ id: string; artifact_type: string; title: string; url: string; content: string; metadata: Record<string, unknown>; task_id: string | null }>
  tasks: Array<{
    id: string; title: string; task_type: string; priority: string; workflow_status: string
    agent_name: string; agent_avatar: string; agent_type: string | null
    latest_run: { id: string; run_status: string; summary: string; total_steps: number; retry_count: number; finished_at: string; evaluation: { verdict: string; score: number } | null } | null
    review: { id: string; review_status: string; score: number; comments: string } | null
    artifacts: Array<{ id: string; artifact_type: string; title: string; url: string }>
    acceptance_criteria: string
    depends_on: string[]
  }>
  blocked_items: ReportData['tasks']
  generated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', planned: '已规划', assigned: '已分配', running: '执行中',
  blocked: '阻塞', submitted: '已提交', under_review: '审核中',
  revision_required: '需返工', approved: '已审批', completed: '已完成', archived: '已归档',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8', planned: '#22d3ee', assigned: '#60a5fa',
  running: '#fbbf24', blocked: '#f87171', submitted: '#a78bfa',
  under_review: '#fb923c', revision_required: '#f87171',
  approved: '#34d399', completed: '#34d399', archived: '#64748b',
}

const ARTIFACT_TYPE_META: Record<string, { label: string; color: string; icon: typeof Package }> = {
  code_pr:         { label: 'PR',       color: 'text-emerald-400', icon: GitBranch },
  issue:           { label: 'Issue',    color: 'text-cyan-400',    icon: GitBranch },
  markdown_doc:    { label: '文档',     color: 'text-violet-400',  icon: FileText },
  json_data:       { label: '数据',     color: 'text-amber-400',   icon: Package },
  design_spec:     { label: '设计稿',   color: 'text-pink-400',    icon: Package },
  research_report: { label: '调研报告', color: 'text-blue-400',    icon: FileText },
  other:           { label: '其它',     color: 'text-slate-400',   icon: Package },
}

export default function ProjectReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/report`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [projectId])

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

  if (!data) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>找不到该项目</p>
        </main>
      </div>
    )
  }

  const { project, stats, artifacts_by_type, artifacts, tasks, blocked_items } = data

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        {/* Header */}
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-[10px] mb-2 transition-colors"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={11} /> 返回
          </button>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-mono text-[var(--accent-light)] tracking-widest uppercase mb-0.5">Project Execution Report</p>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{project.name}</h1>
              {project.goal_statement && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{project.goal_statement}</p>
              )}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              生成于 {new Date(data.generated_at).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">

          {/* Stats grid */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <StatCard icon={<Layers size={13} />} label="任务总数"  value={stats.total_tasks}     accent="text-[var(--accent-light)]" />
            <StatCard icon={<CheckCircle2 size={13} />} label="已完成" value={stats.completed}    accent="text-emerald-400" sub={`${stats.completion_pct}%`} />
            <StatCard icon={<Activity size={13} />} label="进行中"   value={stats.in_progress}    accent="text-amber-400" />
            <StatCard icon={<AlertTriangle size={13} />} label="阻塞" value={stats.blocked + stats.revision_required} accent="text-red-400" />
            <StatCard icon={<TrendingUp size={13} />} label="执行次数" value={stats.total_runs}    accent="text-cyan-400" sub={`${stats.successful_runs} 成功 · ${stats.failed_runs} 失败`} />
            <StatCard icon={<Package size={13} />} label="产出物"     value={stats.total_artifacts} accent="text-violet-400" />
          </div>

          {/* Progress bar */}
          <div className="glass rounded-xl p-4 mb-6">
            <div className="flex justify-between text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
              <span>项目完成度</span>
              <span>{stats.completed} / {stats.total_tasks} 任务</span>
            </div>
            <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${stats.completion_pct}%`, background: 'linear-gradient(90deg, #6366f1, #34d399)' }} />
            </div>
          </div>

          {/* Blocked items (priority section) */}
          {blocked_items.length > 0 && (
            <div className="glass-strong rounded-xl p-5 mb-6" style={{ border: '1px solid rgba(248,113,113,0.3)' }}>
              <div className="flex items-center gap-2 mb-3 text-red-400">
                <AlertTriangle size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">需关注 ({blocked_items.length})</span>
              </div>
              <div className="space-y-2">
                {blocked_items.map(t => (
                  <div key={t.id} className="text-xs p-3 rounded-lg flex items-start gap-3"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <span className="text-base">{t.agent_avatar}</span>
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: STATUS_COLORS[t.workflow_status] ?? '#94a3b8', border: '1px solid var(--border)' }}>
                          {STATUS_LABELS[t.workflow_status] ?? t.workflow_status}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.agent_name}</span>
                      </div>
                      {t.review?.comments && (
                        <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>{t.review.comments}</p>
                      )}
                    </div>
                    <a href={`/task-runs/${t.latest_run?.id ?? ''}`}
                      className="text-[10px] flex items-center gap-1"
                      style={{ color: 'var(--accent-light)' }}>
                      详情 <ExternalLink size={9} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artifacts gallery */}
          {artifacts.length > 0 && (
            <div className="glass rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-violet-400">
                  <Package size={13} />
                  <span className="text-xs font-semibold uppercase tracking-wider">产出物 ({artifacts.length})</span>
                </div>
                <div className="flex gap-2 text-[9px]">
                  {Object.entries(artifacts_by_type).map(([type, count]) => {
                    const meta = ARTIFACT_TYPE_META[type] ?? ARTIFACT_TYPE_META.other
                    return (
                      <span key={type} className={`px-2 py-0.5 rounded ${meta.color}`}
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                        {meta.label} · {count}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {artifacts.map(a => {
                  const meta = ARTIFACT_TYPE_META[a.artifact_type] ?? ARTIFACT_TYPE_META.other
                  const Icon = meta.icon
                  return (
                    <div key={a.id} className="rounded-lg p-3"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Icon size={11} className={`${meta.color} mt-0.5 shrink-0`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                            <span className={`text-[9px] ${meta.color}`}>{meta.label}</span>
                          </div>
                        </div>
                        {a.url && (
                          <a href={a.url} target="_blank" rel="noreferrer"
                            className="text-[10px] flex items-center gap-0.5 shrink-0"
                            style={{ color: 'var(--accent-light)' }}>
                            打开 <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                      {!!a.metadata?.files_written && Array.isArray(a.metadata.files_written) && (
                        <div className="flex flex-wrap gap-1 mt-2 ml-5">
                          {(a.metadata.files_written as string[]).slice(0, 4).map(f => (
                            <code key={f} className="text-[8px] px-1 py-0.5 rounded font-mono"
                              style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--text-muted)' }}>
                              {f}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Task tree */}
          <div className="glass rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3 text-cyan-400">
              <Target size={13} />
              <span className="text-xs font-semibold uppercase tracking-wider">任务执行明细 ({tasks.length})</span>
            </div>
            <div className="space-y-2">
              {tasks.map(t => {
                const statusColor = STATUS_COLORS[t.workflow_status] ?? '#94a3b8'
                const statusLabel = STATUS_LABELS[t.workflow_status] ?? t.workflow_status
                return (
                  <div key={t.id} className="rounded-lg p-3"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start gap-3">
                      <span className="text-base shrink-0">{t.agent_avatar || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: statusColor, border: `1px solid ${statusColor}40`, background: `${statusColor}10` }}>
                            {statusLabel}
                          </span>
                          {t.priority === 'must' && (
                            <span className="text-[9px] text-red-400">MUST</span>
                          )}
                          {t.latest_run?.retry_count && t.latest_run.retry_count > 0 ? (
                            <span className="text-[9px] text-amber-400">↻ {t.latest_run.retry_count}</span>
                          ) : null}
                        </div>

                        {t.latest_run?.summary && (
                          <p className="text-[11px] mb-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t.latest_run.summary}</p>
                        )}

                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.agent_name}</span>
                          {t.latest_run && (
                            <>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>·</span>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.latest_run.total_steps} 步</span>
                            </>
                          )}
                          {t.latest_run?.evaluation && (
                            <>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>·</span>
                              <span className="text-[9px] text-amber-400">QA {t.latest_run.evaluation.score}/10</span>
                            </>
                          )}
                          {t.review?.score && t.review.score > 0 ? (
                            <>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>·</span>
                              <span className="text-[9px] text-emerald-400">评分 {t.review.score}</span>
                            </>
                          ) : null}

                          {t.artifacts.length > 0 && (
                            <>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>·</span>
                              <div className="flex gap-1">
                                {t.artifacts.slice(0, 3).map(ar => {
                                  const am = ARTIFACT_TYPE_META[ar.artifact_type] ?? ARTIFACT_TYPE_META.other
                                  return ar.url ? (
                                    <a key={ar.id} href={ar.url} target="_blank" rel="noreferrer"
                                      className={`text-[9px] flex items-center gap-0.5 ${am.color}`}>
                                      {am.label} <ExternalLink size={8} />
                                    </a>
                                  ) : (
                                    <span key={ar.id} className={`text-[9px] ${am.color}`}>{am.label}</span>
                                  )
                                })}
                              </div>
                            </>
                          )}
                          {t.latest_run?.id && (
                            <a href={`/task-runs/${t.latest_run.id}`}
                              className="ml-auto text-[9px] flex items-center gap-0.5"
                              style={{ color: 'var(--accent-light)' }}>
                              详情 <ExternalLink size={8} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, accent, sub }: { icon: React.ReactNode; label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className={`flex items-center gap-1.5 mb-1.5 ${accent}`}>
        {icon}
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-mono ${accent}`}>{value}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
