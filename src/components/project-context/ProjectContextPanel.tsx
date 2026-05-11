'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Lock, Unlock, Sparkles, Target, Activity, AlertTriangle,
  ChevronRight, Clock, Shield, X,
} from 'lucide-react'

interface ContextRow {
  id: string
  project_id: string
  project_goal: string
  current_stage: string
  current_focus: string
  key_decisions: Array<{ at: string; text: string }>
  completed_items: Array<{ at: string; text: string }>
  blockers: Array<{ at: string; text: string }>
  next_actions: Array<{ at: string; text: string }>
  forbidden_changes: string[]
  important_files: string[]
  last_ai_summary: string
  context_version: number
  locked: boolean
  locked_at: string | null
  updated_at: string
}

interface Activity {
  id: string
  activity_type: string
  title: string
  summary: string
  created_at: string
}

interface HandoffSummary {
  what_is_this_project: string
  current_progress: string
  recent_completions: string[]
  biggest_risk: string
  next_step: string
  forbidden: string[]
  onboarding_checklist: string[]
  text: string
}

const ACTIVITY_COLOR: Record<string, string> = {
  decision: '#a78bfa', code_change: '#22d3ee', deployment: '#34d399',
  bug: '#f87171', workflow_update: '#fbbf24', task_update: '#22d3ee',
  manager_report: '#a78bfa', ai_summary: '#a78bfa', risk: '#fb923c',
  approval: '#fbbf24', context_update: '#94a3b8',
}

export default function ProjectContextPanel({ projectId }: { projectId: string }) {
  const [ctx, setCtx] = useState<ContextRow | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null)
  const [handoffOpen, setHandoffOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/projects/${projectId}/context`)
    if (r.ok) {
      const d = await r.json()
      setCtx(d.context)
      setActivity(d.activity ?? [])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function toggleLock() {
    if (!ctx) return
    setBusy(true)
    await fetch(`/api/projects/${projectId}/context/lock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: !ctx.locked }),
    })
    setBusy(false)
    load()
  }

  async function genHandoff() {
    setBusy(true)
    setHandoffOpen(true)
    const r = await fetch(`/api/projects/${projectId}/handoff`, { method: 'POST' })
    setBusy(false)
    if (r.ok) {
      const d = await r.json()
      setHandoff(d.summary)
      load()  // refresh activity (handoff writes an ai_summary entry)
    } else {
      setHandoffOpen(false)
    }
  }

  if (loading) {
    return (
      <aside className="w-72 border-l border-[var(--border)] glass p-4 shrink-0 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-[var(--accent-light)]" />
      </aside>
    )
  }
  if (!ctx) return null

  return (
    <>
      <aside className="w-72 border-l border-[var(--border)] glass shrink-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Shield size={13} className={ctx.locked ? 'text-emerald-400' : 'text-[var(--text-muted)]'} />
            <p className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: ctx.locked ? '#34d399' : 'var(--text-muted)' }}>
              {ctx.locked ? 'Locked Context' : 'Project Context'}
            </p>
            <span className="ml-auto text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
              v{ctx.context_version}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <button onClick={toggleLock} disabled={busy}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1 rounded disabled:opacity-40"
              style={{
                background: ctx.locked ? 'rgba(52,211,153,0.12)' : 'rgba(99,102,241,0.12)',
                color: ctx.locked ? '#34d399' : 'var(--accent-light)',
                border: `1px solid ${ctx.locked ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)'}`,
              }}>
              {ctx.locked ? <Unlock size={9} /> : <Lock size={9} />}
              {ctx.locked ? 'Unlock' : 'Lock Context'}
            </button>
            <button onClick={genHandoff} disabled={busy}
              className="flex items-center justify-center gap-1 text-[10px] px-2 py-1 rounded disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              <Sparkles size={9} /> Handoff
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">

          {ctx.project_goal && (
            <Field icon={Target} title="项目目标" color="text-cyan-400" body={ctx.project_goal} />
          )}

          {(ctx.current_stage || ctx.current_focus) && (
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>当前进度</p>
              {ctx.current_stage && (
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  阶段：<span className="text-[var(--accent-light)]">{ctx.current_stage}</span>
                </p>
              )}
              {ctx.current_focus && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  焦点：{ctx.current_focus}
                </p>
              )}
            </div>
          )}

          <List icon={ChevronRight} title="下一步" color="text-cyan-400"
            items={ctx.next_actions.slice(0, 5).map(n => n.text)}
            empty="尚未明确" />

          <List icon={AlertTriangle} title="阻塞" color="text-amber-400"
            items={ctx.blockers.slice(-5).map(b => b.text)}
            empty="无阻塞" />

          <List icon={X} title="禁止修改" color="text-red-400"
            items={ctx.forbidden_changes}
            empty="未设置" />

          {ctx.last_ai_summary && (
            <Field icon={Sparkles} title="Last AI Summary" color="text-violet-400"
              body={ctx.last_ai_summary.length > 280
                ? ctx.last_ai_summary.slice(0, 280) + '…'
                : ctx.last_ai_summary} />
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Activity size={9} /> 最近活动
            </p>
            {activity.length === 0 ? (
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>暂无</p>
            ) : (
              <div className="space-y-1">
                {activity.slice(0, 8).map(a => {
                  const color = ACTIVITY_COLOR[a.activity_type] ?? '#94a3b8'
                  return (
                    <div key={a.id} className="text-[10px] flex items-start gap-1.5">
                      <span className="mt-0.5" style={{ color }}>●</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ color: 'var(--text-secondary)' }}>{a.title}</p>
                        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          {a.activity_type} · {new Date(a.created_at).toLocaleTimeString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            <Clock size={8} className="inline mr-1" />
            updated {new Date(ctx.updated_at).toLocaleString('zh-CN')}
          </p>

        </div>
      </aside>

      {/* Handoff modal */}
      {handoffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setHandoffOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="glass-strong rounded-xl p-5 max-w-2xl w-full max-h-[80vh] overflow-auto"
            style={{ border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Sparkles size={14} className="text-violet-400" /> Project Handoff Summary
              </p>
              <button onClick={() => setHandoffOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
            </div>
            {busy && !handoff ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-[var(--accent-light)]" />
              </div>
            ) : handoff ? (
              <div className="text-xs space-y-3" style={{ color: 'var(--text-primary)' }}>
                <H title="这个项目是什么">{handoff.what_is_this_project}</H>
                <H title="当前做到了哪一步">{handoff.current_progress}</H>
                {handoff.recent_completions.length > 0 && (
                  <HList title="最近完成了什么" items={handoff.recent_completions} />
                )}
                <H title="当前最大风险">{handoff.biggest_risk}</H>
                <H title="下一步该做什么">{handoff.next_step}</H>
                {handoff.forbidden.length > 0 && (
                  <HList title="⛔ 哪些不能动" items={handoff.forbidden} color="text-red-400" />
                )}
                <HList title="如果交给新 Agent / 新工程师，应该先看什么" items={handoff.onboarding_checklist} />
                <div className="pt-3 mt-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => navigator.clipboard.writeText(handoff.text)}
                    className="text-[10px] px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    复制为 Markdown
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

function Field({ icon: Icon, title, color, body }: { icon: typeof Target; title: string; color: string; body: string }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${color}`}>
        <Icon size={9} /> {title}
      </p>
      <p className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{body}</p>
    </div>
  )
}

function List({ icon: Icon, title, color, items, empty }: {
  icon: typeof Target; title: string; color: string; items: string[]; empty: string
}) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${color}`}>
        <Icon size={9} /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => <li key={i} className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>· {it}</li>)}
        </ul>
      )}
    </div>
  )
}

function H({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{children}</p>
    </div>
  )
}

function HList({ title, items, color }: { title: string; items: string[]; color?: string }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1 ${color ?? ''}`} style={!color ? { color: 'var(--text-muted)' } : undefined}>{title}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="text-xs" style={{ color: color ? undefined : 'var(--text-primary)' }}>- {it}</li>)}
      </ul>
    </div>
  )
}
