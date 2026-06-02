'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2, Check, Plus, Trash2, ChevronDown, ChevronRight, ArrowRight,
  Sparkles, FolderPlus, Terminal, Copy, FolderDown, GitBranch,
} from 'lucide-react'
import { slugify, buildScaffoldCommand, STACKS, type StackId } from '@/lib/projects/scaffold'

// ─────────────────────────────────────────────────
// V3.6 — Unified project creation: 新建 (local scaffold) | 导入已有
// No separate import page — both live here as two modes.
// ─────────────────────────────────────────────────

const STAGES = ['想法', '验证', '构建', '上线', '增长', '规模化']
const MANAGERS: Array<{ role: string; label: string }> = [
  { role: 'ceo', label: 'CEO（战略）' },
  { role: 'engineering_manager', label: 'CTO（工程）' },
  { role: 'finance_manager', label: 'COO（运营/财务）' },
  { role: 'growth_manager', label: 'CGO（增长）' },
  { role: 'design_manager', label: 'CPO（产品/设计）' },
  { role: 'qa_manager', label: 'QA（质量）' },
  { role: 'risk_manager', label: 'CSO（风险）' },
]

interface ProjForm {
  name: string
  project_goal: string
  current_stage: number
  north_star_metric: string
  monthly_focus: string
  blockers: string
  next_actions: string
  owner_manager: string
}
const blank = (name = '', owner = 'ceo'): ProjForm => ({
  name, project_goal: '', current_stage: 1, north_star_metric: '',
  monthly_focus: '', blockers: '', next_actions: '', owner_manager: owner,
})
const IMPORT_SEED: ProjForm[] = [
  blank('Super Individual OS', 'engineering_manager'),
  blank('外贸/电商业务系统', 'growth_manager'),
  blank('订单节拍器', 'finance_manager'),
  blank('财务 Agent', 'finance_manager'),
  blank('生产排单系统', 'finance_manager'),
  blank('客户增长系统', 'growth_manager'),
  blank('品牌运营系统', 'design_manager'),
]

const inputCls = 'w-full text-xs p-2 rounded-lg'
const inputStyle = { background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const

export default function NewProjectPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
        </main>
      </div>
    }>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const params = useSearchParams()
  const [mode, setMode] = useState<'new' | 'import'>(params.get('mode') === 'import' ? 'import' : 'new')

  // Shared System picker
  const [systems, setSystems] = useState<Array<{ id: string; name: string }>>([])
  const [systemChoice, setSystemChoice] = useState<string>('__new__')   // id | '__new__'
  const [systemName, setSystemName] = useState('我的项目集')

  useEffect(() => {
    createClient().from('systems').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Array<{ id: string; name: string }>
        setSystems(list)
        if (list.length > 0) setSystemChoice(list[0].id)
      })
  }, [])

  function systemPayload(): { system_id?: string; system_name?: string } {
    return systemChoice === '__new__' ? { system_name: systemName.trim() || '我的项目集' } : { system_id: systemChoice }
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Projects</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>新建 / 导入项目</h1>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-3xl">
          {/* Mode toggle */}
          <div className="flex gap-2 mb-5">
            <ModeTab active={mode === 'new'} onClick={() => setMode('new')}
              icon={<Sparkles size={13} />} label="新建项目" sub="在你电脑上建脚手架" />
            <ModeTab active={mode === 'import'} onClick={() => setMode('import')}
              icon={<FolderDown size={13} />} label="导入已有项目" sub="把现有项目搬进来管理" />
          </div>

          {/* Shared System picker */}
          <div className="glass rounded-xl p-4 mb-4">
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>归属 System</p>
            <div className="flex gap-2">
              <select value={systemChoice} onChange={e => setSystemChoice(e.target.value)}
                className={inputCls} style={inputStyle}>
                {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__new__">+ 新建 System…</option>
              </select>
              {systemChoice === '__new__' && (
                <input value={systemName} onChange={e => setSystemName(e.target.value)}
                  placeholder="新 System 名称" className={inputCls} style={inputStyle} />
              )}
            </div>
          </div>

          {mode === 'new'
            ? <NewMode router={router} systemPayload={systemPayload} />
            : <ImportMode router={router} systemPayload={systemPayload} />}
        </div>
      </main>
    </div>
  )
}

function ModeTab({ active, onClick, icon, label, sub }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string
}) {
  return (
    <button onClick={onClick}
      className="flex-1 text-left p-3 rounded-xl transition-all"
      style={{
        background: active ? 'rgba(167,139,250,0.12)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'var(--border)'}`,
      }}>
      <div className="flex items-center gap-1.5 mb-0.5" style={{ color: active ? '#a78bfa' : 'var(--text-secondary)' }}>
        {icon}<span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </button>
  )
}

// ── 新建：single project + local scaffold command ──────────────────────
function NewMode({ router, systemPayload }: {
  router: ReturnType<typeof useRouter>
  systemPayload: () => { system_id?: string; system_name?: string }
}) {
  const [f, setF] = useState<ProjForm>(blank('', 'ceo'))
  const [name, setName] = useState('')
  const [dirName, setDirName] = useState('')
  const [dirTouched, setDirTouched] = useState(false)
  const [stack, setStack] = useState<StackId>('nextjs-supabase')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ system_id: string; project_id?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // GitHub one-click repo state
  const [ghBusy, setGhBusy] = useState(false)
  const [ghErr, setGhErr] = useState<string | null>(null)
  const [ghRepo, setGhRepo] = useState<{ html_url: string; push_command: string } | null>(null)

  async function createGithubRepo() {
    setGhErr(null); setGhBusy(true)
    try {
      const r = await fetch('/api/projects/github-repo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: effectiveDir, description: f.project_goal, project_id: done?.project_id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.ok) { setGhErr(data.hint || data.error || '建仓失败'); return }
      setGhRepo({ html_url: data.html_url, push_command: data.push_command })
    } catch (e) {
      setGhErr(e instanceof Error ? e.message : String(e))
    } finally { setGhBusy(false) }
  }

  // dir name auto-tracks the project name until the user edits it.
  const effectiveDir = dirTouched ? dirName : slugify(name)
  const plan = useMemo(() => buildScaffoldCommand({ dirName: effectiveDir, stack }), [effectiveDir, stack])

  function patch(p: Partial<ProjForm>) { setF(prev => ({ ...prev, ...p })) }

  async function submit() {
    setError(null)
    if (!name.trim()) { setError('项目名不能为空'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/projects/import-systems', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...systemPayload(),
          projects: [{
            name: name.trim(),
            project_goal: f.project_goal.trim(),
            current_stage: f.current_stage,
            north_star_metric: f.north_star_metric.trim(),
            monthly_focus: f.monthly_focus.trim(),
            blockers: f.blockers.split('\n').map(s => s.trim()).filter(Boolean),
            next_actions: f.next_actions.split('\n').map(s => s.trim()).filter(Boolean),
            owner_manager: f.owner_manager,
          }],
        }),
      })
      if (!r.ok) { setError((await r.text().catch(() => '')) || `创建失败 (${r.status})`); return }
      const data = await r.json()
      setDone({ system_id: data.system_id, project_id: data.results?.[0]?.project_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCmd() {
    try { await navigator.clipboard.writeText(plan.command); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl p-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)' }}>
          <div className="flex items-center gap-2 mb-1 text-emerald-400">
            <Check size={15} /><span className="text-sm font-semibold">项目已在 OS 中创建</span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            已建 project + 锁定 context + 生成首份经理报告。<Link href={`/systems/${done.system_id}`} className="text-violet-400 ml-1">查看 System →</Link>
          </p>
        </div>

        {/* The "在电脑上建立" command */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-cyan-400">
            <Terminal size={13} /><span className="text-xs font-semibold uppercase tracking-wider">在你电脑上建立（复制到终端运行）</span>
          </div>
          <div className="relative">
            <pre className="text-[11px] font-mono p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {plan.command}
            </pre>
            <button onClick={copyCmd}
              className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded"
              style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
              {copied ? <><Check size={10} /> 已复制</> : <><Copy size={10} /> 复制</>}
            </button>
          </div>
          <div className="mt-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <p className="mb-1 font-semibold">这条命令会：</p>
            <ul className="space-y-0.5 mb-2">{plan.steps.map((s, i) => <li key={i}>· {s}</li>)}</ul>
            <p className="mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>跑完后连接工具：</p>
            <ul className="space-y-0.5">{plan.next.map((s, i) => <li key={i}>→ {s}</li>)}</ul>
          </div>
        </div>

        {/* One-click GitHub repo */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-secondary)' }}>
            <GitBranch size={13} /><span className="text-xs font-semibold uppercase tracking-wider">GitHub 远程仓库</span>
          </div>
          {ghRepo ? (
            <div className="space-y-2">
              <p className="text-[11px] text-emerald-400 flex items-center gap-1"><Check size={11} /> 已创建：
                <a href={ghRepo.html_url} target="_blank" rel="noreferrer" className="underline ml-1">{ghRepo.html_url}</a>
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>本地脚手架跑完后，推上去：</p>
              <pre className="text-[11px] font-mono p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {ghRepo.push_command}
              </pre>
            </div>
          ) : (
            <>
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                用你存的 GitHub token 直接建一个空的私有仓库 <code className="font-mono">{effectiveDir}</code>，省掉手动建仓 + git push 那步。
              </p>
              <button onClick={createGithubRepo} disabled={ghBusy}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                {ghBusy ? <><Loader2 size={11} className="animate-spin" /> 建仓中…</> : <><GitBranch size={12} /> 一键建 GitHub 仓库</>}
              </button>
              {ghErr && <p className="text-[10px] mt-2" style={{ color: '#f87171' }}>{ghErr}</p>}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => { setDone(null); setName(''); setF(blank('', 'ceo')); setGhRepo(null); setGhErr(null) }}
            className="text-xs px-4 py-2 rounded-lg" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            再建一个
          </button>
          <button onClick={() => router.push(`/systems/${done.system_id}`)}
            className="text-xs px-4 py-2 rounded-lg text-white" style={{ background: 'var(--accent)' }}>
            去 System 看看
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Local scaffold config */}
      <div className="glass rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-cyan-400 mb-1">
          <FolderPlus size={13} /><span className="text-xs font-semibold uppercase tracking-wider">项目 + 本地脚手架</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>项目名</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：AI 财务系统" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>本地目录名（英文）</label>
            <input value={effectiveDir} onChange={e => { setDirTouched(true); setDirName(e.target.value) }}
              placeholder="my-project" className={`${inputCls} font-mono`} style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>技术栈</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {STACKS.map(s => (
              <button key={s.id} onClick={() => setStack(s.id)}
                className="text-left p-2 rounded-lg transition-all"
                style={{
                  background: stack === s.id ? 'rgba(34,211,238,0.1)' : 'var(--bg-base)',
                  border: `1px solid ${stack === s.id ? 'rgba(34,211,238,0.4)' : 'var(--border)'}`,
                }}>
                <p className="text-[11px] font-semibold" style={{ color: stack === s.id ? '#22d3ee' : 'var(--text-primary)' }}>{s.label}</p>
                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Operating metadata (so manager reports aren't empty) */}
      <div className="glass rounded-xl p-4 space-y-2">
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>项目状态（让经理报告有料）</p>
        <input value={f.project_goal} onChange={e => patch({ project_goal: e.target.value })}
          placeholder="项目目标（一句话）" className={inputCls} style={inputStyle} />
        <div className="grid grid-cols-2 gap-2">
          <select value={f.current_stage} onChange={e => patch({ current_stage: Number(e.target.value) })} className={inputCls} style={inputStyle}>
            {STAGES.map((s, i) => <option key={i} value={i}>{i} · {s}</option>)}
          </select>
          <select value={f.owner_manager} onChange={e => patch({ owner_manager: e.target.value })} className={inputCls} style={inputStyle}>
            {MANAGERS.map(m => <option key={m.role} value={m.role}>{m.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={f.north_star_metric} onChange={e => patch({ north_star_metric: e.target.value })} placeholder="北极星指标" className={inputCls} style={inputStyle} />
          <input value={f.monthly_focus} onChange={e => patch({ monthly_focus: e.target.value })} placeholder="本月焦点" className={inputCls} style={inputStyle} />
        </div>
      </div>

      {error && <div className="rounded-xl p-3 text-[11px] whitespace-pre-line font-mono" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
          {submitting ? <><Loader2 size={13} className="animate-spin" /> 创建中…</> : <>创建项目并生成脚手架命令 <ArrowRight size={13} /></>}
        </button>
        <Link href="/projects" className="text-xs px-4 py-2.5 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>取消</Link>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        云端会建 project + 锁定 context + 出首份经理报告；脚手架命令复制到终端运行即在本地落地（云端无法直接写你的磁盘）。
      </p>
    </div>
  )
}

// ── 导入：multi-project ─────────────────────────────────────────────
function ImportMode({ router, systemPayload }: {
  router: ReturnType<typeof useRouter>
  systemPayload: () => { system_id?: string; system_name?: string }
}) {
  const [forms, setForms] = useState<ProjForm[]>(IMPORT_SEED)
  const [open, setOpen] = useState<Set<number>>(new Set([0]))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ system_id: string; imported: number; total: number; warnings?: string[] } | null>(null)

  const patch = (i: number, p: Partial<ProjForm>) => setForms(fs => fs.map((f, idx) => idx === i ? { ...f, ...p } : f))
  const toggle = (i: number) => setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  async function submit() {
    setError(null)
    const usable = forms.filter(f => f.name.trim())
    if (usable.length === 0) { setError('至少要有一个项目名'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/projects/import-systems', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...systemPayload(),
          projects: usable.map(f => ({
            name: f.name.trim(), project_goal: f.project_goal.trim(),
            current_stage: f.current_stage, north_star_metric: f.north_star_metric.trim(),
            monthly_focus: f.monthly_focus.trim(),
            blockers: f.blockers.split('\n').map(s => s.trim()).filter(Boolean),
            next_actions: f.next_actions.split('\n').map(s => s.trim()).filter(Boolean),
            owner_manager: f.owner_manager,
          })),
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.ok) {
        // Surface the per-project reasons instead of a raw JSON dump.
        const reasons: string[] = Array.isArray(data.results)
          ? data.results.filter((x: { ok: boolean }) => !x.ok)
              .map((x: { name: string; error?: string }) => `${x.name}: ${x.error ?? '未知错误'}`)
          : []
        setError(reasons.length ? `导入失败：\n${reasons.join('\n')}` : (data.error || `导入失败 (${r.status})`))
        return
      }
      // Collect any best-effort warnings (e.g. context lock skipped) to show.
      const warns: string[] = Array.isArray(data.results)
        ? data.results.flatMap((x: { name: string; warnings?: string[] }) =>
            (x.warnings ?? []).map(w => `${x.name}: ${w}`))
        : []
      setResult({ system_id: data.system_id, imported: data.imported, total: data.total, warnings: warns })
      setTimeout(() => router.push(`/systems/${data.system_id}`), warns.length ? 4000 : 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSubmitting(false) }
  }

  if (result) {
    return (
      <div className="rounded-xl p-6" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)' }}>
        <div className="flex items-center gap-2 mb-2 text-emerald-400"><Check size={16} /><span className="text-sm font-semibold">导入完成</span></div>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>成功导入 {result.imported}/{result.total} 个项目。</p>
        {result.warnings && result.warnings.length > 0 && (
          <div className="mt-2 rounded-lg p-2 text-[10px]"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>
            <p className="font-semibold mb-1">项目已建好，但部分增强步骤被跳过（多半是缺 v2.5 迁移）：</p>
            {result.warnings.slice(0, 8).map((w, i) => <div key={i} className="font-mono">· {w}</div>)}
          </div>
        )}
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>正在跳转… 或 <Link href={`/systems/${result.system_id}`} className="text-violet-400">立即前往 →</Link></p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {forms.map((f, i) => {
        const isOpen = open.has(i)
        return (
          <div key={i} className="glass rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <button onClick={() => toggle(i)} className="text-[var(--text-muted)]">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <input value={f.name} onChange={e => patch(i, { name: e.target.value })} placeholder="项目名"
                className="flex-1 bg-transparent text-sm font-semibold outline-none" style={{ color: 'var(--text-primary)' }} />
              <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>{STAGES[f.current_stage]}</span>
              <button onClick={() => setForms(fs => fs.filter((_, idx) => idx !== i))} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[var(--border)]">
                <input value={f.project_goal} onChange={e => patch(i, { project_goal: e.target.value })} placeholder="项目目标" className={inputCls} style={inputStyle} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={f.current_stage} onChange={e => patch(i, { current_stage: Number(e.target.value) })} className={inputCls} style={inputStyle}>
                    {STAGES.map((s, idx) => <option key={idx} value={idx}>{idx} · {s}</option>)}
                  </select>
                  <select value={f.owner_manager} onChange={e => patch(i, { owner_manager: e.target.value })} className={inputCls} style={inputStyle}>
                    {MANAGERS.map(m => <option key={m.role} value={m.role}>{m.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={f.north_star_metric} onChange={e => patch(i, { north_star_metric: e.target.value })} placeholder="北极星指标" className={inputCls} style={inputStyle} />
                  <input value={f.monthly_focus} onChange={e => patch(i, { monthly_focus: e.target.value })} placeholder="本月焦点" className={inputCls} style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <textarea value={f.blockers} onChange={e => patch(i, { blockers: e.target.value })} rows={2} placeholder="阻塞（每行一条）" className={inputCls} style={inputStyle} />
                  <textarea value={f.next_actions} onChange={e => patch(i, { next_actions: e.target.value })} rows={2} placeholder="下一步（每行一条）" className={inputCls} style={inputStyle} />
                </div>
              </div>
            )}
          </div>
        )
      })}
      <button onClick={() => { setForms(fs => [...fs, blank()]); setOpen(s => new Set(s).add(forms.length)) }}
        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
        <Plus size={12} /> 再加一个项目
      </button>

      {error && <div className="rounded-xl p-3 text-[11px] whitespace-pre-line font-mono" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>{error}</div>}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={submit} disabled={submitting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
          {submitting ? <><Loader2 size={13} className="animate-spin" /> 导入中…</> : <>导入 {forms.filter(f => f.name.trim()).length} 个项目 <ArrowRight size={13} /></>}
        </button>
        <Link href="/projects" className="text-xs px-4 py-2.5 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>取消</Link>
      </div>
    </div>
  )
}
