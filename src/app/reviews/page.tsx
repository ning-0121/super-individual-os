'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { ClipboardCheck, CheckCircle2, XCircle, RotateCcw, Clock } from 'lucide-react'

type ReviewItem = {
  id: string
  task_id: string
  task_title: string
  review_status: string
  score: number
  comments: string
  revision_instructions: string
  created_at: string
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.FC<{ size?: number; className?: string }> }> = {
  pending:           { label: '待审核', color: 'text-amber-400',   icon: Clock },
  approved:          { label: '已通过', color: 'text-emerald-400', icon: CheckCircle2 },
  revision_required: { label: '需返工', color: 'text-red-400',     icon: RotateCcw },
  rejected:          { label: '已拒绝', color: 'text-red-500',     icon: XCircle },
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>('all')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/reviews').catch(() => null)
      if (res?.ok) {
        const data = await res.json()
        setReviews(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const displayed = filter === 'all' ? reviews : reviews.filter(r => r.review_status === filter)

  async function updateReview(id: string, status: string, score?: number) {
    await fetch(`/api/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_status: status, score }),
    })
    setReviews(prev => prev.map(r => r.id === id ? { ...r, review_status: status, score: score ?? r.score } : r))
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-amber-400 tracking-widest uppercase mb-0.5">Multi-Agent OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Review Gate 验收闸门</h1>
          </div>
          <div className="flex gap-2">
            {['all','pending','approved','revision_required'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-xs px-2.5 py-1 rounded-lg transition-all"
                style={{
                  border: `1px solid ${filter === f ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: filter === f ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: filter === f ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>
                {f === 'all' ? '全部' : STATUS_META[f]?.label ?? f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading && <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && displayed.length === 0 && (
            <div className="text-center py-20">
              <ClipboardCheck size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-[var(--text-muted)] text-sm">暂无待验收任务</p>
              <p className="text-[var(--text-muted)] text-xs mt-2">当 Agent 提交任务后，会出现在这里等待验收</p>
            </div>
          )}

          {!loading && displayed.length > 0 && (
            <div className="max-w-3xl space-y-3">
              {displayed.map(review => {
                const meta = STATUS_META[review.review_status] ?? STATUS_META.pending
                const StatusIcon = meta.icon
                return (
                  <div key={review.id} className="glass rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {review.task_title || '未命名任务'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusIcon size={11} className={meta.color} />
                          <span className={`text-[10px] ${meta.color}`}>{meta.label}</span>
                          {review.score > 0 && (
                            <span className="text-[10px] text-amber-400">评分: {review.score}/10</span>
                          )}
                        </div>
                      </div>
                      {review.review_status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateReview(review.id, 'approved', 8)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                            <CheckCircle2 size={11} /> 通过
                          </button>
                          <button onClick={() => updateReview(review.id, 'revision_required')}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                            <RotateCcw size={11} /> 返工
                          </button>
                        </div>
                      )}
                    </div>

                    {review.comments && (
                      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{review.comments}</p>
                    )}
                    {review.revision_instructions && (
                      <div className="text-xs p-2 rounded-lg" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}>
                        <span className="font-semibold">返工说明：</span>{review.revision_instructions}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
