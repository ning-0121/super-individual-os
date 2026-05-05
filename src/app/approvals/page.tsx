'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import {
  Loader2, ShieldCheck, AlertTriangle, X, RefreshCw, ExternalLink,
  Crown, Wrench, Brain,
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
  required_approvers: string[]
  approvers_acted: Array<{ role: string; decision: string; ts: string }>
  status: string
  classification_reason: string
  created_at: string
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
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} /> 刷新
          </button>
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
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-red-400" />
              <Group key="qa" icon={ShieldCheck} title="等待 QA + 经理" sub="L3 高影响动作" rows={groups.qa}
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-orange-400" />
              <Group key="manager" icon={Wrench} title="等待经理审批" sub="L2 领域受限动作" rows={groups.manager}
                resolving={resolvingId} onResolve={resolve} reason={reason} setReason={setReason} accent="text-amber-400" />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Group({ icon: Icon, title, sub, rows, resolving, onResolve, reason, setReason, accent }: {
  icon: typeof ShieldCheck; title: string; sub: string; rows: ApprovalRow[];
  resolving: string | null;
  onResolve: (req: ApprovalRow, decision: 'approved' | 'rejected') => void;
  reason: Record<string, string>;
  setReason: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  accent: string;
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-6">
      <div className={`flex items-center gap-2 mb-3 ${accent}`}>
        <Icon size={13} />
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {sub} · {rows.length} 条</span>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <ApprovalCard key={r.id} req={r} resolving={resolving === r.id}
            onResolve={onResolve}
            reason={reason[r.id] ?? ''}
            onChangeReason={(v) => setReason(prev => ({ ...prev, [r.id]: v }))} />
        ))}
      </div>
    </div>
  )
}

function ApprovalCard({ req, resolving, onResolve, reason, onChangeReason }: {
  req: ApprovalRow;
  resolving: boolean;
  onResolve: (req: ApprovalRow, decision: 'approved' | 'rejected') => void;
  reason: string;
  onChangeReason: (v: string) => void;
}) {
  const risk = RISK_META[req.risk_level] ?? RISK_META[2]
  const created = new Date(req.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="glass rounded-xl p-4" style={{ border: `1px solid ${risk.border}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: risk.bg, color: risk.color, border: `1px solid ${risk.border}` }}>
              {risk.label}
            </span>
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
        </div>
      </div>
    </div>
  )
}

// keep linter happy
void Brain
