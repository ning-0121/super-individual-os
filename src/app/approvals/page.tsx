'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, ShieldCheck, AlertTriangle, X, RefreshCw, ExternalLink,
  Crown, Wrench, Brain, Sparkles, CheckSquare, Square,
} from 'lucide-react'

interface ApprovalRow {
  id: string
  project_id: string
  project_name: string | null
  task_id: string | null
  task_title: string | null
  task_type: string | null
  task_run_id: string | null
  action_type: string
  action_payload: Record<string, unknown>
  risk_level: 0 | 1 | 2 | 3 | 4
  risk_label?: 'low' | 'medium' | 'high' | 'critical'
  title?: string
  description?: string
  requested_by?: string
  explanation?: string
  required_approvers: string[]
  approvers_acted: Array<{ role: string; decision: string; ts: string }>
  status: string
  classification_reason: string
  created_at: string
}

interface ExplanationData {
  why_approval_needed: string
  risks: string[]
  impact_if_approved: string[]
  impact_if_rejected: string[]
  recommendation: 'approve' | 'reject' | 'review_carefully'
  confidence: number
}

const RISK_LABEL_META: Record<string, { color: string; bg: string; border: string }> = {
  low:      { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)' },
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
}

const RISK_META: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: 'L0', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' },
  1: { label: 'L1', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' },
  2: { label: 'L2', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  3: { label: 'L3', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)' },
  4: { label: 'L4', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  ceo:                 { label: 'CEO',          color: 'text-red-400' },
  engineering_manager: { label: '工程经理',     color: 'text-emerald-400' },
  qa_manager:          { label: 'QA 经理',       color: 'text-cyan-400' },
  finance_manager:     { label: '财务经理',     color: 'text-amber-400' },
  growth_manager:      { label: '增长经理',     color: 'text-pink-400' },
  design_manager:      { label: '设计经理',     color: 'text-violet-400' },
  risk_manager:        { label: '风险官',       color: 'text-orange-400' },
}

type GroupKey = 'ceo' | 'qa' | 'manager'

export default function ApprovalsPage() {
  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [reason, setReason] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [explainOpen, setExplainOpen] = useState<{ id: string; data: ExplanationData | null; text?: string } | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function selectAll(rows: ApprovalRow[]) {
    setSelected(prev => {
      const next = new Set(prev)
      const allSelected = rows.every(r => next.has(r.id))
      for (const r of rows) {
        if (allSelected) next.delete(r.id); else next.add(r.id)
      }
      return next
    })
  }

  async function bulk(mode: 'approve' | 'reject' | 'approve_all_at_or_below', riskLabel?: string) {
    if (bulkBusy) return
    if (mode !== 'approve_all_at_or_below' && selected.size === 0) {
      alert('请先勾选要批量操作的审批项')
      return
    }
    if (mode === 'approve_all_at_or_below') {
      if (!confirm(`确认批准所有 ${riskLabel} 及以下风险的待审批项？`)) return
    }
    setBulkBusy(true)
    const body = mode === 'approve_all_at_or_below'
      ? { mode, risk_label: riskLabel }
      : { mode, ids: Array.from(selected) }
    const r = await fetch('/api/approval-requests/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    setBulkBusy(false)
    if (!r.ok) {
      alert('批量操作失败: ' + (data?.error?.message ?? r.statusText))
      return
    }
    alert(`已处理 ${data.processed ?? 0} 项（成功 ${data.succeeded ?? 0}）`)
    setSelected(new Set())
    load()
  }

  async function explain(id: string) {
    setExplainLoading(true)
    setExplainOpen({ id, data: null })
    const r = await fetch(`/api/approval-requests/${id}/explain`, { method: 'POST' })
    setExplainLoading(false)
    if (!r.ok) {
      setExplainOpen(null)
      alert('生成解释失败')
      return
    }
    const data = await r.json()
    setExplainOpen({ id, data: data.explanation, text: data.text })
  }

  async function load() {
    setLoading(true)
    const r = await fetch('/api/approval-requests?status=pending')
    if (r.ok) setRows(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function resolve(req: ApprovalRow, decision: 'approved' | 'rejected') {
    setResolvingId(req.id)
    const res = await fetch(`/api/approval-requests/${req.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: reason[req.id] || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setResolvingId(null)

    if (!res.ok) {
      alert('操作失败: ' + (data?.error?.message ?? data?.error ?? res.statusText))
      return
    }

    // Approved with task_run → offer to navigate
    if (decision === 'approved' && data.execution?.task_run_id) {
      if (confirm('审批通过，已开始执行。是否查看运行详情？')) {
        window.location.href = `/task-runs/${data.execution.task_run_id}`
        return
      }
    }
    await load()
  }

  // Group by max-required approver
  function groupOf(req: ApprovalRow): GroupKey {
    if (req.required_approvers.includes('ceo')) return 'ceo'
    if (req.required_approvers.includes('qa_manager')) return 'qa'
    return 'manager'
  }

  const groups: Record<GroupKey, ApprovalRow[]> = { ceo: [], qa: [], manager: [] }
  for (const r of rows) groups[groupOf(r)].push(r)

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">

        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-amber-400 tracking-widest uppercase mb-0.5">Manager Layer</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>待审批 ({rows.length})</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => bulk('approve_all_at_or_below', 'low')} disabled={bulkBusy}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              批准所有 low
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>已选 {selected.size}</span>
                <button onClick={() => bulk('approve')} disabled={bulkBusy}
                  className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  批量批准
                </button>
                <button onClick={() => bulk('reject')} disabled={bulkBusy}
                  className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
                  批量拒绝
                </button>
              </>
            )}
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <RefreshCw size={11} /> 刷新
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-5xl">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="text-center py-20">
              <ShieldCheck size={28} className="mx-auto mb-3 text-emerald-400" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>当前没有待审批的请求</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                高风险任务（L2 及以上）会出现在这里等待你批准
              </p>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <>
              <Group key="ceo" icon={Crown} title="等待 CEO 决策" sub="L4 关键业务" rows={groups.ceo}
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-red-400"
                selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
                onExplain={explain} />
              <Group key="qa" icon={ShieldCheck} title="等待 QA + 经理" sub="L3 高影响动作" rows={groups.qa}
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-orange-400"
                selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
                onExplain={explain} />
              <Group key="manager" icon={Wrench} title="等待经理审批" sub="L2 领域受限动作" rows={groups.manager}
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-amber-400"
                selected={selected} onToggleSelect={toggleSelect} onSelectAll={selectAll}
                onExplain={explain} />
            </>
          )}
        </div>
      </main>

      {/* Explain modal */}
      {explainOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setExplainOpen(null)}>
          <div onClick={e => e.stopPropagation()}
            className="glass-strong rounded-xl p-5 max-w-lg w-full max-h-[80vh] overflow-auto"
            style={{ border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Sparkles size={14} className="text-[var(--accent-light)]" /> Approval Explanation
              </p>
              <button onClick={() => setExplainOpen(null)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
            </div>
            {explainLoading || !explainOpen.data ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-[var(--accent-light)]" />
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>为什么需要审批</p>
                  <p style={{ color: 'var(--text-primary)' }}>{explainOpen.data.why_approval_needed}</p>
                </div>
                <Block title="风险" color="text-amber-400" items={explainOpen.data.risks} />
                <Block title="批准后的影响" color="text-emerald-400" items={explainOpen.data.impact_if_approved} />
                <Block title="拒绝后的影响" color="text-cyan-400" items={explainOpen.data.impact_if_rejected} />
                <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>建议</p>
                  <p className={`text-sm font-medium ${
                    explainOpen.data.recommendation === 'approve' ? 'text-emerald-400'
                    : explainOpen.data.recommendation === 'reject' ? 'text-red-400' : 'text-amber-400'}`}>
                    {explainOpen.data.recommendation === 'approve' ? '✅ 建议批准'
                      : explainOpen.data.recommendation === 'reject' ? '❌ 建议拒绝' : '⚠ 仔细审查'}
                    <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>
                      confidence {Math.round(explainOpen.data.confidence * 100)}%
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Block({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1 ${color}`}>{title}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} style={{ color: 'var(--text-secondary)' }}>· {it}</li>)}
      </ul>
    </div>
  )
}

function Group({ icon: Icon, title, sub, rows, resolving, onResolve, reason, setReason, accent,
                 selected, onToggleSelect, onSelectAll, onExplain }: {
  icon: typeof ShieldCheck; title: string; sub: string; rows: ApprovalRow[];
  resolving: string | null;
  onResolve: (req: ApprovalRow, decision: 'approved' | 'rejected') => void;
  reason: Record<string, string>;
  setReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  accent: string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (rows: ApprovalRow[]) => void;
  onExplain: (id: string) => void;
}) {
  if (rows.length === 0) return null
  const allChecked = rows.every(r => selected.has(r.id))
  return (
    <div className="mb-6">
      <div className={`flex items-center gap-2 mb-3 ${accent}`}>
        <button onClick={() => onSelectAll(rows)}
          className="text-[10px] hover:opacity-80" title="全选/反选">
          {allChecked ? <CheckSquare size={11} /> : <Square size={11} />}
        </button>
        <Icon size={13} />
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {sub} · {rows.length} 条</span>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <ApprovalCard key={r.id} req={r} resolving={resolving === r.id}
            onResolve={onResolve}
            reason={reason[r.id] ?? ''}
            onChangeReason={(v) => setReason(prev => ({ ...prev, [r.id]: v }))}
            isSelected={selected.has(r.id)}
            onToggleSelect={() => onToggleSelect(r.id)}
            onExplain={() => onExplain(r.id)} />
        ))}
      </div>
    </div>
  )
}

function ApprovalCard({ req, resolving, onResolve, reason, onChangeReason,
                        isSelected, onToggleSelect, onExplain }: {
  req: ApprovalRow;
  resolving: boolean;
  onResolve: (req: ApprovalRow, decision: 'approved' | 'rejected') => void;
  reason: string;
  onChangeReason: (v: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  onExplain: () => void;
}) {
  const risk = RISK_META[req.risk_level] ?? RISK_META[2]
  const labelMeta = req.risk_label ? RISK_LABEL_META[req.risk_label] : null
  const created = new Date(req.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="glass rounded-xl p-4" style={{ border: `1px solid ${risk.border}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <button onClick={onToggleSelect}
          className="mt-1 shrink-0" title="选择以批量处理"
          style={{ color: isSelected ? 'var(--accent-light)' : 'var(--text-muted)' }}>
          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.border}` }}>
              {risk.label}
            </span>
            {req.risk_label && labelMeta && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
                style={{ background: labelMeta.bg, color: labelMeta.color, border: `1px solid ${labelMeta.border}` }}>
                {req.risk_label}
              </span>
            )}
            <code className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {req.action_type}
            </code>
            {req.task_title && (
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {req.task_title}
              </p>
            )}
          </div>

          {req.project_name && (
            <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
              项目：<Link href={`/projects/${req.project_id}`} className="text-[var(--accent-light)] hover:underline">
                {req.project_name}
              </Link>
              {req.task_type && <> · 类型：{req.task_type}</>}
              <> · {created}</>
            </p>
          )}

          {req.classification_reason && (
            <p className="text-[11px] flex items-start gap-1.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
              <AlertTriangle size={10} className="mt-0.5 shrink-0" style={{ color: risk.color }} />
              <span>{req.classification_reason}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-1 mb-2">
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>需要审批：</span>
            {req.required_approvers.map(role => {
              const m = ROLE_META[role] ?? { label: role, color: 'text-slate-400' }
              return (
                <code key={role} className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${m.color}`}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  {m.label}
                </code>
              )
            })}
          </div>

          {req.task_run_id && (
            <Link href={`/task-runs/${req.task_run_id}`}
              className="text-[10px] inline-flex items-center gap-1"
              style={{ color: 'var(--accent-light)' }}>
              查看上次运行 <ExternalLink size={9} />
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <input value={reason} onChange={e => onChangeReason(e.target.value)}
          placeholder="（可选）写下决策理由..."
          className="w-full text-[11px] px-3 py-2 rounded-lg focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />

        <div className="flex gap-2">
          <button onClick={() => onResolve(req, 'approved')} disabled={resolving}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}>
            {resolving ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            通过审批
          </button>
          <button onClick={() => onResolve(req, 'rejected')} disabled={resolving}
            className="flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
            <X size={11} />
            驳回
          </button>
          <button onClick={onExplain}
            className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)', border: '1px solid rgba(99,102,241,0.3)' }}
            title="生成解释 / Why approve">
            <Sparkles size={11} /> Explain
          </button>
        </div>
      </div>
    </div>
  )
}

// keep linter happy
void Brain
