'use client'
import { Loader2, AlertTriangle, X, Target, ChevronRight } from 'lucide-react'

export interface FocusCheckResult {
  off_focus: boolean
  similarity: number
  reason?: string
  locked: boolean
  project_goal: string
  current_focus: string
}

interface Props {
  open: boolean
  result: FocusCheckResult | null
  taskTitle: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

// FocusGuardModal — only renders when the parent decides to open it.
// The parent is responsible for calling /api/projects/[id]/focus-check first
// and only opening when (off_focus=true AND locked=true).
export default function FocusGuardModal({ open, result, taskTitle, loading, onCancel, onConfirm }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className="glass-strong rounded-xl p-5 max-w-md w-full"
        style={{ border: '1px solid rgba(251,191,36,0.4)' }}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-400" />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            This task may be off-focus
          </p>
          <button onClick={onCancel} className="ml-auto" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        {loading || !result ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[var(--accent-light)]" />
          </div>
        ) : (
          <>
            <div className="space-y-2.5 text-xs mb-4">
              <Row icon={Target} color="text-cyan-400" label="当前项目目标"
                body={result.project_goal || '(尚未设置)'} />
              {result.current_focus && (
                <Row icon={Target} color="text-cyan-400" label="当前 focus"
                  body={result.current_focus} />
              )}
              <Row icon={ChevronRight} color="text-amber-400" label="该任务标题"
                body={taskTitle} />
              <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>相似度</span>
                <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-1 rounded-full bg-amber-400"
                    style={{ width: `${Math.round(result.similarity * 100)}%` }} />
                </div>
                <span className="font-mono">{Math.round(result.similarity * 100)}%</span>
              </div>
            </div>

            <div className="text-[11px] p-3 rounded-lg mb-4"
              style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--text-secondary)' }}>
              💡 {result.reason ?? '这可能偏离当前项目 focus。是否仍然创建？'}
            </div>

            <div className="flex gap-2">
              <button onClick={onCancel}
                className="flex-1 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
              <button onClick={onConfirm}
                className="flex-1 text-xs px-3 py-2 rounded-lg font-medium"
                style={{ background: 'rgba(251,191,36,0.18)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}>
                Create Anyway
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ icon: Icon, color, label, body }: { icon: typeof Target; color: string; label: string; body: string }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1 ${color}`}>
        <Icon size={9} /> {label}
      </p>
      <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{body}</p>
    </div>
  )
}
