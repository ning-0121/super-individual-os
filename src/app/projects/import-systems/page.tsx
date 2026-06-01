'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, Check, ChevronDown, ChevronRight, Trash2, Plus, ArrowRight } from 'lucide-react'

// ─────────────────────────────────────────────────
// V3.5 — Import Existing Systems
// Rich per-project import: goal / stage / north-star / focus / blockers /
// next-actions / owner-manager. On submit → /api/projects/import-systems
// creates project + locked context + handoff + first manager report.
// ─────────────────────────────────────────────────

const STAGES = ['想法', '验证', '构建', '上线', '增长', '规模化'] // index = current_stage

const MANAGERS: Array<{ role: string; label: string }> = [
  { role: 'ceo', label: 'CEO（战略）' },
  { role: 'engineering_manager', label: 'CTO（工程）' },
  { role: 'finance_manager', label: 'COO（运营/财务）' },
  { role: 'growth_manager', label: 'CGO（增长）' },
  { role: 'design_manager', label: 'CPO（产品/设计）' },
  { role: 'qa_manager', label: 'QA（质量）' },
  { role: 'risk_manager', label: 'CSO（风险）' },
]

interface ProjectForm {
  name: string
  project_goal: string
  current_stage: number
  north_star_metric: string
  monthly_focus: string
  blockers: string       // one per line in the textarea
  next_actions: string   // one per line
  owner_manager: string
}

function blank(name = '', owner = 'ceo'): ProjectForm {
  return { name, project_goal: '', current_stage: 1, north_star_metric: '', monthly_focus: '', blockers: '', next_actions: '', owner_manager: owner }
}

// Pre-seed the user's 7 real projects with sensible default owners.
const SEED: ProjectForm[] = [
  blank('Super Individual OS', 'engineering_manager'),
  blank('外贸/电商业务系统', 'growth_manager'),
  blank('订单节拍器', 'finance_manager'),
  blank('财务 Agent', 'finance_manager'),
  blank('生产排单系统', 'finance_manager'),
  blank('客户增长系统', 'growth_manager'),
  blank('品牌运营系统', 'design_manager'),
]

export default function ImportSystemsPage() {
  const router = useRouter()
  const [systemName, setSystemName] = useState('我的项目集')
  const [businessGoal, setBusinessGoal] = useState('把现有的几个项目搬进来统一管理')
  const [forms, setForms] = useState<ProjectForm[]>(SEED)
  const [open, setOpen] = useState<Set<number>>(new Set([0]))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ system_id: string; imported: number; total: number } | null>(null)

  function patch(i: number, p: Partial<ProjectForm>) {
    setForms(fs => fs.map((f, idx) => idx === i ? { ...f, ...p } : f))
  }
  function toggle(i: number) {
    setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  }
  function removeProject(i: number) {
    setForms(fs => fs.filter((_, idx) => idx !== i))
  }
  function addProject() {
    setForms(fs => [...fs, blank()])
    setOpen(s => new Set(s).add(forms.length))
  }

  async function submit() {
    setError(null)
    const usable = forms.filter(f => f.name.trim())
    if (usable.length === 0) { setError('至少要有一个项目名'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/projects/import-systems', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_name: systemName.trim(),
          business_goal: businessGoal.trim() || undefined,
          projects: usable.map(f => ({
            name: f.name.trim(),
            project_goal: f.project_goal.trim(),
            current_stage: f.current_stage,
            north_star_metric: f.north_star_metric.trim(),
            monthly_focus: f.monthly_focus.trim(),
            blockers: f.blockers.split('\n').map(s => s.trim()).filter(Boolean),
            next_actions: f.next_actions.split('\n').map(s => s.trim()).filter(Boolean),
            owner_manager: f.owner_manager,
          })),
        }),
      })
      if (!r.ok) { setError((await r.text().catch(() => '')) || `导入失败 (${r.status})`); return }
      const data = await r.json()
      setResult({ system_id: data.system_id, imported: data.imported, total: data.total })
      setTimeout(() => router.push(`/systems/${data.system_id}`), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full text-xs p-2 rounded-lg'
  const inputStyle = { background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Import Existing Systems</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>导入已有项目</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            填上每个项目的真实状态 → 自动建 project + 锁定 context + 生成交接摘要 + 首份经理报告。
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-3xl">

          {result ? (
            <div className="rounded-xl p-6"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)' }}>
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <Check size={16} /><span className="text-sm font-semibold">导入完成</span>
              </div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                成功导入 {result.imported}/{result.total} 个项目，已锁定 context + 生成首份经理报告。
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                正在跳转到 System… 或
                <Link href={`/systems/${result.system_id}`} className="text-violet-400 ml-1">立即前往 →</Link>
              </p>
            </div>
          ) : (
            <>
              {/* Umbrella system */}
              <div className="glass rounded-xl p-4 mb-4">
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>装这些项目的 System</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={systemName} onChange={e => setSystemName(e.target.value)}
                    placeholder="我的项目集" className={inputCls} style={inputStyle} />
                  <input value={businessGoal} onChange={e => setBusinessGoal(e.target.value)}
                    placeholder="统一目标（可选）" className={inputCls} style={inputStyle} />
                </div>
              </div>

              {/* Project cards */}
              <div className="space-y-2 mb-4">
                {forms.map((f, i) => {
                  const isOpen = open.has(i)
                  return (
                    <div key={i} className="glass rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 p-3">
                        <button onClick={() => toggle(i)} className="text-[var(--text-muted)]">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <input value={f.name} onChange={e => patch(i, { name: e.target.value })}
                          placeholder="项目名"
                          className="flex-1 bg-transparent text-sm font-semibold outline-none"
                          style={{ color: 'var(--text-primary)' }} />
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
                          {STAGES[f.current_stage]}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {MANAGERS.find(m => m.role === f.owner_manager)?.label.split('（')[0] ?? 'CEO'}
                        </span>
                        <button onClick={() => removeProject(i)} className="text-[var(--text-muted)] hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[var(--border)]">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>项目目标 (project_goal)</label>
                            <input value={f.project_goal} onChange={e => patch(i, { project_goal: e.target.value })}
                              placeholder="一句话说清这个项目要达成什么" className={inputCls} style={inputStyle} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>当前阶段 (current_stage)</label>
                              <select value={f.current_stage} onChange={e => patch(i, { current_stage: Number(e.target.value) })}
                                className={inputCls} style={inputStyle}>
                                {STAGES.map((s, idx) => <option key={idx} value={idx}>{idx} · {s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>负责经理 (owner_manager)</label>
                              <select value={f.owner_manager} onChange={e => patch(i, { owner_manager: e.target.value })}
                                className={inputCls} style={inputStyle}>
                                {MANAGERS.map(m => <option key={m.role} value={m.role}>{m.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>北极星指标 (north_star_metric)</label>
                              <input value={f.north_star_metric} onChange={e => patch(i, { north_star_metric: e.target.value })}
                                placeholder="如：月付费用户数" className={inputCls} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>本月焦点 (monthly_focus)</label>
                              <input value={f.monthly_focus} onChange={e => patch(i, { monthly_focus: e.target.value })}
                                placeholder="这个月只做的一件事" className={inputCls} style={inputStyle} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>当前阻塞 (blockers, 每行一条)</label>
                              <textarea value={f.blockers} onChange={e => patch(i, { blockers: e.target.value })}
                                rows={3} placeholder={'卡点 A\n卡点 B'} className={inputCls} style={inputStyle} />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>下一步 (next_actions, 每行一条)</label>
                              <textarea value={f.next_actions} onChange={e => patch(i, { next_actions: e.target.value })}
                                rows={3} placeholder={'下一步 1\n下一步 2'} className={inputCls} style={inputStyle} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button onClick={addProject}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg mb-4"
                style={{ color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
                <Plus size={12} /> 再加一个项目
              </button>

              {error && (
                <div className="rounded-xl p-3 mb-4 text-[11px]"
                  style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={submit} disabled={submitting}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
                  style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
                  {submitting
                    ? <><Loader2 size={13} className="animate-spin" /> 正在导入并初始化…</>
                    : <>导入 {forms.filter(f => f.name.trim()).length} 个项目 <ArrowRight size={13} /></>}
                </button>
                <Link href="/mission-control" className="text-xs px-4 py-2.5 rounded-lg"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>取消</Link>
              </div>
              <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
                每个项目导入后会：建 project → 写入并锁定 context → 生成交接摘要 → 由负责经理出首份报告 → 记一条 activity log。
              </p>
            </>
          )}

        </div>
      </main>
    </div>
  )
}
