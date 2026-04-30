'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import Sidebar from '@/components/layout/Sidebar'
import { TaskRun, Task, ExecutionUnit, TaskReview } from '@/types'
import { AGENT_TYPE_META } from '@/services/agents'
import { ArrowLeft, CheckCircle2, RotateCcw, Clock, Loader2, AlertTriangle, Lightbulb, Brain, FileText, Target } from 'lucide-react'

const RUN_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: '待运行', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  running:    { label: '执行中', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  completed:  { label: '已完成', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  failed:     { label: '失败',   color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  cancelled:  { label: '已取消', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

interface RunDetailData {
  run: TaskRun
  task: Task
  agent: ExecutionUnit | null
  reviews: TaskReview[]
}

export default function TaskRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<RunDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [reviewComment, setReviewComment] = useState('')

  useEffect(() => {
    fetch(`/api/task-runs/${id}`).then(async r => {
      if (r.ok) setData(await r.json())
      setLoading(false)
    })
  }, [id])

  async function submitReview(status: 'approved' | 'revision_required', score?: number) {
    if (!data) return
    const pendingReview = data.reviews.find(r => r.review_status === 'pending')
    if (!pendingReview) return
    setReviewing(true)
    await fetch(`/api/reviews/${pendingReview.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review_status: status,
        score: score ?? (status === 'approved' ? 8 : 0),
        comments: reviewComment,
        revision_instructions: status === 'revision_required' ? reviewComment : '',
      }),
    })
    // Refresh
    const refreshed = await fetch(`/api/task-runs/${id}`).then(r => r.json())
    setData(refreshed)
    setReviewComment('')
    setReviewing(false)
  }

  async function rerun() {
    if (!data) return
    setReviewing(true)
    const res = await fetch(`/api/tasks/${data.task.id}/run`, { method: 'POST' })
    const result = await res.json()
    if (result.task_run_id) router.push(`/task-runs/${result.task_run_id}`)
    setReviewing(false)
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

  if (!data) {
    return (
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>找不到该执行记录</p>
        </main>
      </div>
    )
  }

  const { run, task, agent, reviews } = data
  const statusMeta = RUN_STATUS_META[run.run_status] ?? RUN_STATUS_META.pending
  const agentMeta = agent ? (AGENT_TYPE_META[agent.agent_type] ?? AGENT_TYPE_META.general) : null
  const pendingReview = reviews.find(r => r.review_status === 'pending')
  const completedReviews = reviews.filter(r => r.review_status !== 'pending')
  const output = (run.output_payload ?? {}) as { summary?: string; output?: string; risks?: string[]; next_steps?: string[] }

  const startedAt = run.started_at ? new Date(run.started_at).toLocaleString('zh-CN') : '—'
  const finishedAt = run.finished_at ? new Date(run.finished_at).toLocaleString('zh-CN') : '—'
  const duration = run.finished_at && run.started_at
    ? `${Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)} 秒`
    : '—'

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
            <div className="flex-1">
              <p className="text-xs font-mono text-[var(--accent-light)] tracking-widest uppercase mb-0.5">Task Run</p>
              <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{task.title}</h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded font-mono"
                  style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.color}40` }}>
                  {statusMeta.label}
                </span>
                {agent && agentMeta && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
                    style={{ background: agentMeta.bg, border: '1px solid var(--border)' }}>
                    <span>{agent.avatar}</span>
                    <span className={agentMeta.color}>{agent.name}</span>
                  </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>开始：{startedAt}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>耗时：{duration}</span>
              </div>
            </div>

            {/* Actions */}
            {pendingReview && run.run_status === 'completed' && (
              <div className="flex gap-2">
                <button onClick={() => submitReview('approved', 9)} disabled={reviewing}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  <CheckCircle2 size={11} /> 通过验收
                </button>
                <button onClick={() => submitReview('revision_required')} disabled={reviewing || !reviewComment.trim()}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <RotateCcw size={11} /> 要求返工
                </button>
              </div>
            )}
            {run.run_status === 'failed' && (
              <button onClick={rerun} disabled={reviewing}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                {reviewing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                重新运行
              </button>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6 max-w-4xl">

          {/* Run failed - show error */}
          {run.run_status === 'failed' && run.error_message && (
            <div className="glass rounded-xl p-5 mb-4" style={{ border: '1px solid rgba(248,113,113,0.3)' }}>
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <AlertTriangle size={13} />
                <span className="text-xs font-semibold uppercase tracking-wider">运行失败</span>
              </div>
              <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{run.error_message}</p>
            </div>
          )}

          {/* Running indicator */}
          {run.run_status === 'running' && (
            <div className="glass rounded-xl p-5 mb-4 flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-400">Agent 正在执行...</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请稍候，结果稍后会自动出现</p>
              </div>
            </div>
          )}

          {/* Output payload */}
          {run.run_status === 'completed' && output && (
            <>
              {/* Summary */}
              {output.summary && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-2 text-[var(--accent-light)]">
                    <FileText size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">摘要</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{output.summary}</p>
                </div>
              )}

              {/* Reasoning */}
              {run.reasoning_summary && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-2 text-violet-400">
                    <Brain size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">解决思路</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{run.reasoning_summary}</p>
                </div>
              )}

              {/* Output */}
              {output.output && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3 text-emerald-400">
                    <Target size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">交付物</span>
                  </div>
                  <div className="ai-prose">
                    <ReactMarkdown>{output.output}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Risks */}
              {output.risks && output.risks.length > 0 && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-2 text-amber-400">
                    <AlertTriangle size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">风险与注意事项</span>
                  </div>
                  <ul className="space-y-1">
                    {output.risks.map((r, i) => (
                      <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <span className="text-amber-400 mt-0.5">⚠</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              {output.next_steps && output.next_steps.length > 0 && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-2 text-cyan-400">
                    <Lightbulb size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">建议后续动作</span>
                  </div>
                  <ul className="space-y-1">
                    {output.next_steps.map((s, i) => (
                      <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <span className="text-cyan-400 mt-0.5">→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Review section */}
          {pendingReview && run.run_status === 'completed' && (
            <div className="glass-strong rounded-xl p-5 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">待验收</span>
              </div>
              <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                placeholder="（可选）写下评价、修改建议或验收备注..."
                rows={3} className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none mb-2"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <div className="flex items-center justify-between">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  通过 → 任务变为 completed | 返工 → 需补充修改说明
                </p>
              </div>
            </div>
          )}

          {/* Completed reviews */}
          {completedReviews.length > 0 && (
            <div className="glass rounded-xl p-5 mb-4">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">验收历史</p>
              <div className="space-y-2">
                {completedReviews.map(r => {
                  const isApproved = r.review_status === 'approved'
                  return (
                    <div key={r.id} className="flex items-start gap-3 text-xs p-2 rounded-lg"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      {isApproved ? <CheckCircle2 size={11} className="text-emerald-400 mt-0.5" /> : <RotateCcw size={11} className="text-red-400 mt-0.5" />}
                      <div className="flex-1">
                        <p className={isApproved ? 'text-emerald-400' : 'text-red-400'}>
                          {isApproved ? `已通过 (${r.score}/10)` : '需返工'}
                        </p>
                        {r.comments && <p style={{ color: 'var(--text-muted)' }}>{r.comments}</p>}
                        {r.revision_instructions && <p className="text-red-400 mt-1">修改：{r.revision_instructions}</p>}
                        <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          {new Date(r.created_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Metadata footer */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="glass rounded-lg p-3">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">输入上下文</p>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--text-muted)' }}>
                {JSON.stringify(run.input_payload, null, 2)}
              </pre>
            </div>
            <div className="glass rounded-lg p-3">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">运行元数据</p>
              <div className="text-[10px] space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p>状态：<span style={{ color: statusMeta.color }}>{statusMeta.label}</span></p>
                <p>开始：{startedAt}</p>
                <p>结束：{finishedAt}</p>
                <p>耗时：{duration}</p>
                <p className="font-mono">Run ID: {run.id}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
