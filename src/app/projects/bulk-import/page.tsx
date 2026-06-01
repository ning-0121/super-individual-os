'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, FolderPlus, Check, X, ArrowRight, Sparkles } from 'lucide-react'
import { parseProjectList } from '@/lib/projects/bulk-parser'

// ─────────────────────────────────────────────────
// V3.4 — Bulk Project Import
// Paste a list of projects you already run → one click materializes them
// under a single umbrella System, with 7 default managers seeded per project.
// ─────────────────────────────────────────────────

const PLACEHOLDER =
  '在这里贴一份你的现有项目清单。系统会自动解析「1、xxx 2、yyy」/ 换行 / 逗号等格式。\n\n' +
  '例如：\n' +
  '1、节拍器\n' +
  '2、财务系统\n' +
  '3、客户开发系统\n' +
  '4、生产系统\n' +
  '5、报价员\n' +
  '6、品牌运营系统\n' +
  '7、AI 设计系统'

export default function BulkImportPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
        </main>
      </div>
    }>
      <BulkImportInner />
    </Suspense>
  )
}

function BulkImportInner() {
  const router = useRouter()
  const params = useSearchParams()
  const seed = params.get('seed') ?? ''

  const [raw, setRaw] = useState(seed)
  const [systemName, setSystemName] = useState('我的项目集')
  const [businessGoal, setBusinessGoal] = useState('把现有的几个项目搬进来统一管理')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ system_id: string; project_count: number; managers_seeded: number } | null>(null)

  useEffect(() => { if (seed) setRaw(seed) }, [seed])

  const parsed = useMemo(() => parseProjectList(raw), [raw])
  const [overrides, setOverrides] = useState<Record<number, string>>({})

  // Final names = parsed.items with any per-row edits applied.
  const finalNames = useMemo(
    () => parsed.items.map((n, i) => (overrides[i] ?? n).trim()).filter(Boolean),
    [parsed.items, overrides],
  )

  async function handleImport() {
    setError(null)
    if (finalNames.length === 0) { setError('解析不出项目名，请检查输入'); return }
    if (!systemName.trim())      { setError('System 名字不能为空'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/projects/bulk-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_name: systemName.trim(),
          business_goal: businessGoal.trim() || undefined,
          project_names: finalNames,
        }),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        setError(t || `导入失败 (${r.status})`)
        return
      }
      const data = await r.json()
      setResult({ system_id: data.system_id, project_count: data.project_count, managers_seeded: data.managers_seeded })
      // Auto-redirect after a beat.
      setTimeout(() => router.push(`/systems/${data.system_id}`), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Bulk Import</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>把已有项目搬进来</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            一次性建一个 System + N 个 Project，每个 Project 自动配 5 个 AI 经理。
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-4xl">

          {result ? (
            <div className="rounded-xl p-6"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)' }}>
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <Check size={16} />
                <span className="text-sm font-semibold">导入成功</span>
              </div>
              <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                创建了 {result.project_count} 个项目，配置了 {result.managers_seeded} 个 AI 经理。
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                即将跳转到 System 概览… 或
                <Link href={`/systems/${result.system_id}`} className="text-violet-400 ml-1">立即前往 →</Link>
              </p>
            </div>
          ) : (
            <>
              {/* Step 1 — list */}
              <div className="glass rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3 text-violet-400">
                  <FolderPlus size={13} />
                  <span className="text-xs font-semibold uppercase tracking-wider">Step 1 · 粘贴项目清单</span>
                </div>
                <textarea
                  value={raw}
                  onChange={e => { setRaw(e.target.value); setOverrides({}) }}
                  placeholder={PLACEHOLDER}
                  rows={8}
                  className="w-full text-xs p-3 rounded-lg font-mono"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>解析到 <span className="font-mono text-violet-400">{parsed.items.length}</span> 个项目</span>
                  {parsed.dropped.length > 0 && (
                    <span>· 忽略 <span className="font-mono text-amber-400">{parsed.dropped.length}</span> 条非项目内容</span>
                  )}
                </div>
              </div>

              {/* Step 2 — preview + edit */}
              {parsed.items.length > 0 && (
                <div className="glass rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3 text-cyan-400">
                    <Sparkles size={13} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Step 2 · 预览并编辑</span>
                  </div>
                  <div className="space-y-1.5">
                    {parsed.items.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                        <span className="font-mono text-[10px] w-6 text-center" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                        <input
                          value={overrides[i] ?? name}
                          onChange={e => setOverrides({ ...overrides, [i]: e.target.value })}
                          className="flex-1 bg-transparent outline-none"
                          style={{ color: 'var(--text-primary)' }} />
                        <button
                          onClick={() => setOverrides({ ...overrides, [i]: '' })}
                          title="移除"
                          className="text-[var(--text-muted)] hover:text-red-400">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3 — umbrella system */}
              <div className="glass rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-3 text-emerald-400">
                  <FolderPlus size={13} />
                  <span className="text-xs font-semibold uppercase tracking-wider">Step 3 · 装这些项目的 System</span>
                </div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  System 名称
                </label>
                <input
                  value={systemName}
                  onChange={e => setSystemName(e.target.value)}
                  placeholder="我的项目集"
                  className="w-full text-xs p-2 rounded-lg mb-3"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  统一目标（可选）
                </label>
                <input
                  value={businessGoal}
                  onChange={e => setBusinessGoal(e.target.value)}
                  placeholder="把现有项目统一管理 / 月度复盘 / ..."
                  className="w-full text-xs p-2 rounded-lg"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>

              {error && (
                <div className="rounded-xl p-3 mb-4 text-[11px]"
                  style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleImport}
                  disabled={submitting || finalNames.length === 0}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50"
                  style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
                  {submitting
                    ? <><Loader2 size={13} className="animate-spin" /> 正在导入…</>
                    : <>导入 {finalNames.length} 个项目 <ArrowRight size={13} /></>}
                </button>
                <Link href="/mission-control"
                  className="text-xs px-4 py-2.5 rounded-lg"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  取消
                </Link>
              </div>

              <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
                每个项目会自动配置 5 个 AI 经理（CEO/CTO/COO/CGO/CPO + QA + CSO）。导入后可在 /projects/[id] 进入任一项目继续配置。
              </p>
            </>
          )}

        </div>
      </main>
    </div>
  )
}
