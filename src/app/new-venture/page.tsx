'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Rocket, Loader2, ArrowRight, Check, Sparkles, AlertCircle,
  MessageSquare, Bot, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { DraftedVenture } from '@/app/api/new-venture/draft/route'

// ─────────────────────────────────────────────────
// V2.3 — Conversational Venture Bootstrap
// 1. User describes venture in plain language
// 2. AI Co-founder drafts: System + Project + Tasks + Budget + Workflow
// 3. User reviews, edits, or asks for revision
// 4. One click → materialize via /api/new-venture
// ─────────────────────────────────────────────────

const PLACEHOLDER = `例：我想做一个 AI 人格内容工厂，把历史人物（苏轼、王阳明、丘吉尔…）做成有自己立场和风格的 AI，输出脱口秀短视频和长对话内容。希望 3 个月内拿到 1000 个真实订阅用户，月预算 200 美金。我自己负责选题和审稿，剩下的尽量让 AI 经理推进。`

const ROLE_LABEL: Record<string, string> = {
  ceo: 'CEO', engineering_manager: 'CTO', design_manager: 'CPO',
  qa_manager: 'QA', growth_manager: 'CGO', finance_manager: 'COO',
  risk_manager: 'CSO',
}

export default function NewVenturePage() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<DraftedVenture | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Editable fields after draft (lightweight overrides)
  const [override, setOverride] = useState<{ system_name?: string; project_name?: string; business_goal?: string }>({})

  async function generate() {
    if (!description.trim() || description.length < 20) {
      setError('请至少写 20 个字，描述你的目标 / 预算 / 你想自己干什么')
      return
    }
    setDrafting(true); setError(''); setDraft(null)
    try {
      const r = await fetch('/api/new-venture/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error?.message ?? d?.error ?? '起草失败')
      setDraft(d.draft as DraftedVenture)
      setOverride({})
    } catch (e) {
      setError(e instanceof Error ? e.message : '起草失败')
    } finally {
      setDrafting(false)
    }
  }

  async function launch() {
    if (!draft) return
    setSubmitting(true); setError('')
    try {
      const r = await fetch('/api/new-venture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_name:    override.system_name    ?? draft.system.name,
          system_type:    draft.system.type,
          business_goal:  override.business_goal  ?? draft.system.business_goal,
          owner_manager:  draft.system.owner_manager,
          project_name:   override.project_name   ?? draft.project.name,
          project_description: draft.project.description,
          north_star_metric:   draft.project.north_star_metric,
          north_star_target:   draft.project.north_star_target,
          monthly_focus:       draft.project.monthly_focus,
          starter_tasks:       draft.tasks,
          growth_experiments:  draft.growth_experiments,
          budget:              draft.budget,
          workflow:            draft.workflow,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error?.message ?? '创建失败')
      router.push(d.redirect_to ?? '/mission-control')
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket size={18} className="text-pink-400" />
            <div>
              <p className="text-xs font-mono text-pink-400 tracking-widest uppercase mb-0.5">Bootstrap</p>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>启动新 Venture</h1>
            </div>
          </div>
          <Link href="/mission-control" className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            取消 →
          </Link>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">

          {/* 1. Describe */}
          <div className="glass-strong rounded-xl p-5 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
            <p className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <MessageSquare size={14} className="text-pink-400" /> 用一段话告诉 AI 联合创始人
            </p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              说清楚：你想做什么、希望 3 个月达到什么、月预算多少、你自己想保留哪些事 → AI 会起草完整方案（System、Project、关键任务、预算、汇报节奏）。
            </p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder={PLACEHOLDER}
              className="w-full text-sm px-3 py-2 rounded resize-none focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {description.length} 字 · 模型：Claude Sonnet · 不会执行任何外部动作
              </p>
              <button onClick={generate} disabled={drafting || description.trim().length < 20}
                className="text-xs flex items-center gap-1.5 px-4 py-1.5 rounded disabled:opacity-40"
                style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
                {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {drafting ? 'AI 正在起草…' : draft ? '重新起草' : 'AI 起草方案'}
              </button>
            </div>
          </div>

          {error && !drafting && (
            <div className="mb-4 p-3 rounded-lg flex items-start gap-2 text-[11px]"
              style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
              <AlertCircle size={11} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 2. Draft preview */}
          {draft && (
            <>
              <div className="glass rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3 text-violet-400">
                  <Bot size={13} />
                  <span className="text-xs font-semibold uppercase tracking-wider">AI 起草的方案</span>
                  <button onClick={generate}
                    className="ml-auto text-[10px] flex items-center gap-1"
                    style={{ color: 'var(--text-muted)' }}>
                    <RefreshCw size={9} /> 重新生成
                  </button>
                </div>

                {/* System + Project block (editable) */}
                <div className="space-y-3 mb-4">
                  <Editable label="System 名称"
                    value={override.system_name ?? draft.system.name}
                    onChange={v => setOverride(o => ({ ...o, system_name: v }))} />
                  <Editable label="商业目标"
                    value={override.business_goal ?? draft.system.business_goal}
                    onChange={v => setOverride(o => ({ ...o, business_goal: v }))}
                    multiline />
                  <Editable label="第一个 Project"
                    value={override.project_name ?? draft.project.name}
                    onChange={v => setOverride(o => ({ ...o, project_name: v }))} />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs mb-4">
                  <Stat label="北极星" value={`${draft.project.north_star_metric} → ${draft.project.north_star_target}`} />
                  <Stat label="本月聚焦" value={draft.project.monthly_focus} small />
                  <Stat label="负责人" value={ROLE_LABEL[draft.system.owner_manager] ?? draft.system.owner_manager} />
                </div>

                <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                  💡 {draft.reasoning}
                </p>
              </div>

              {/* Tasks */}
              <Section title={`起步任务（${draft.tasks.length}）`} accent="text-emerald-400">
                <div className="space-y-1.5">
                  {draft.tasks.map((t, i) => (
                    <div key={i} className="text-[11px] p-2 rounded-lg"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-[9px] font-mono px-1.5 py-0.5 rounded text-emerald-400"
                          style={{ background: 'rgba(52,211,153,0.1)' }}>
                          {ROLE_LABEL[t.assigned_role] ?? t.assigned_role}
                        </code>
                        <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                        <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.priority}</span>
                      </div>
                      {t.description && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* Budget */}
              <Section title={`首月预算 · $${draft.budget.total_usd}`} accent="text-amber-400">
                <div className="space-y-1.5">
                  {draft.budget.breakdown.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{b.item}</span>
                      <span className="ml-auto font-mono text-amber-400">${b.usd}</span>
                      <span className="text-[9px] w-1/2 text-right" style={{ color: 'var(--text-muted)' }}>{b.rationale}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Workflow */}
              <Section title="汇报与审批节奏" accent="text-cyan-400">
                <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>{draft.workflow.weekly_cadence}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>必须报你审批</p>
                    <ul className="space-y-1">
                      {draft.workflow.escalation_to_ceo.map((s, i) => (
                        <li key={i} className="text-[11px] flex items-start gap-1.5">
                          <span className="text-red-400 mt-0.5">⚠</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>AI 经理自治</p>
                    <ul className="space-y-1">
                      {draft.workflow.autonomous_actions.map((s, i) => (
                        <li key={i} className="text-[11px] flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Section>

              {/* Growth experiments */}
              <Section title={`增长实验（${draft.growth_experiments.length}）`} accent="text-pink-400">
                <div className="space-y-1.5">
                  {draft.growth_experiments.map((g, i) => (
                    <div key={i} className="text-[11px] p-2 rounded-lg"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                        {g.channel && <code className="text-[9px] font-mono ml-auto"
                          style={{ color: 'var(--text-muted)' }}>{g.channel}</code>}
                      </div>
                      {g.hypothesis && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{g.hypothesis}</p>}
                    </div>
                  ))}
                </div>
              </Section>

              {/* Launch CTA */}
              <div className="sticky bottom-0 -mx-6 px-6 py-4 mt-2"
                style={{ background: 'linear-gradient(0deg, var(--bg-base), transparent)' }}>
                <button onClick={launch} disabled={submitting}
                  className="w-full text-sm flex items-center justify-center gap-2 py-3 rounded-lg disabled:opacity-40 font-semibold"
                  style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {submitting ? '正在创建 System / Project / Managers / Tasks…' : '启动 — 让 AI 经理们开始干活'}
                  <ArrowRight size={14} />
                </button>
                <p className="text-center text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  会创建：1 个 System + 1 个 Project + 7 个 AI 经理 + {draft.tasks.length} 个任务 + {draft.growth_experiments.length} 个增长实验
                </p>
              </div>
            </>
          )}

          {/* Manual fallback */}
          {!draft && !drafting && <ManualFallback />}

        </div>
      </main>
    </div>
  )
}

function Editable({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
          className="w-full text-xs px-3 py-2 rounded resize-none focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      )}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`${small ? 'text-[11px]' : 'text-xs'} font-mono`} style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-4 mb-4">
      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${accent}`}>{title}</p>
      {children}
    </div>
  )
}

function ManualFallback() {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass rounded-xl p-4">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs"
        style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-2">
          <Check size={11} /> 不想让 AI 起草？手动创建空白 System
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 pt-3 text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          直接在 <Link href="/systems" className="text-[var(--accent-light)]">/systems</Link> 页面用快速表单创建一个空白 System，再到 <Link href="/projects" className="text-[var(--accent-light)]">/projects</Link> 加 Project。但用上面的 AI 起草流更快、更完整。
        </div>
      )}
    </div>
  )
}
