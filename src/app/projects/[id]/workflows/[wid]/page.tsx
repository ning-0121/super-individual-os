'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Loader2, Play, ArrowLeft, GitBranch, RefreshCw, CheckCircle2, XCircle,
  Pause, AlertTriangle, Lock, Clock, X,
} from 'lucide-react'

interface Workflow {
  id: string; name: string; description: string; status: string
}
interface Step {
  id: string; step_key: string; name: string; description: string
  depends_on: string[]; step_type: string
  requires_approval: boolean; approval_role: string | null
  max_attempts: number; sort_order: number
  metadata: Record<string, unknown>
}
interface Run {
  id: string; status: string; started_at: string; finished_at: string | null
  bottleneck_step_key: string | null; eta_at: string | null
  current_step_keys: string[]; completed_step_keys: string[]; failed_step_keys: string[]
}
interface StepRun {
  id: string; step_key: string; status: string
  attempt: number; max_attempts: number; error_message: string | null
  started_at: string | null; finished_at: string | null; next_retry_at: string | null
}

const STEP_STATUS_META: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  waiting:          { color: '#94a3b8', icon: Clock },
  ready:            { color: '#22d3ee', icon: Play },
  running:          { color: '#fbbf24', icon: Loader2 },
  blocked_approval: { color: '#fbbf24', icon: Lock },
  succeeded:        { color: '#34d399', icon: CheckCircle2 },
  failed:           { color: '#f87171', icon: XCircle },
  escalated:        { color: '#fb923c', icon: AlertTriangle },
  skipped:          { color: '#64748b', icon: Pause },
}

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string; wid: string }> }) {
  const { id: projectId, wid } = use(params)
  const router = useRouter()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [stepRuns, setStepRuns] = useState<StepRun[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/workflows/${wid}`)
    if (r.ok) {
      const d = await r.json()
      setWorkflow(d.workflow)
      setSteps(d.steps ?? [])
      setRun(d.latest_run ?? null)
      setStepRuns(d.step_runs ?? [])
    }
    setLoading(false)
  }, [wid])

  useEffect(() => { load() }, [load])

  async function startRun() {
    setBusy(true)
    const r = await fetch(`/api/workflows/${wid}/run`, { method: 'POST' })
    setBusy(false)
    if (!r.ok) { alert('启动失败'); return }
    await load()
  }

  async function advance() {
    if (!run?.id) return
    setBusy(true)
    await fetch(`/api/workflow-runs/${run.id}/advance`, { method: 'POST' })
    setBusy(false)
    load()
  }

  async function complete(stepRunId: string) {
    setBusy(true)
    await fetch(`/api/workflow-step-runs/${stepRunId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    setBusy(false)
    load()
  }

  async function fail(stepRunId: string) {
    const msg = prompt('失败原因：') ?? ''
    if (!msg.trim() && !confirm('不填理由也继续吗？')) return
    setBusy(true)
    await fetch(`/api/workflow-step-runs/${stepRunId}/fail`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error_message: msg || 'manual fail' }),
    })
    setBusy(false)
    load()
  }

  async function cancel() {
    if (!run?.id) return
    if (!confirm('确定取消当前 run？所有未完成 step 会被 skipped。')) return
    setBusy(true)
    await fetch(`/api/workflow-runs/${run.id}/cancel`, { method: 'POST' })
    setBusy(false)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
    </div>
  )
  if (!workflow) return (
    <div className="p-6 text-center">
      <p className="text-sm text-red-400 mb-2">未找到 workflow</p>
      <Link href={`/projects/${projectId}/workflows`} className="text-xs text-[var(--accent-light)]">
        ← 返回 Workflows
      </Link>
    </div>
  )

  const stepRunByKey = new Map(stepRuns.map(sr => [sr.step_key, sr]))

  return (
    <div className="p-6 max-w-4xl">
      <Link href={`/projects/${projectId}/workflows`}
        className="text-[10px] text-[var(--text-muted)] inline-flex items-center gap-1 mb-2">
        <ArrowLeft size={10} /> Workflows
      </Link>
      <div className="flex items-center gap-3 mb-4">
        <GitBranch size={16} className="text-cyan-400" />
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{workflow.name}</h1>
        <button onClick={load} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-secondary)]" title="刷新">
          <RefreshCw size={11} />
        </button>
      </div>
      {workflow.description && (
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{workflow.description}</p>
      )}

      {/* Run control card */}
      <div className="glass rounded-xl p-4 mb-4">
        {run ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>Latest Run</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase"
                style={{
                  background: run.status === 'failed' ? 'rgba(248,113,113,0.12)'
                    : run.status === 'succeeded' ? 'rgba(52,211,153,0.12)'
                    : run.status === 'blocked_approval' ? 'rgba(251,191,36,0.12)'
                    : 'rgba(34,211,238,0.12)',
                  color: run.status === 'failed' ? '#f87171'
                    : run.status === 'succeeded' ? '#34d399'
                    : run.status === 'blocked_approval' ? '#fbbf24' : '#22d3ee',
                }}>
                {run.status}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                started {new Date(run.started_at).toLocaleString('zh-CN')}
              </span>
              {!['succeeded','failed','cancelled'].includes(run.status) && (
                <>
                  <button onClick={advance} disabled={busy}
                    className="ml-auto text-[10px] px-2 py-1 rounded disabled:opacity-40"
                    style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                    Advance
                  </button>
                  <button onClick={cancel} disabled={busy}
                    className="text-[10px] px-2 py-1 rounded text-red-400 disabled:opacity-40"
                    style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <Stat label="completed" value={run.completed_step_keys.length} total={steps.length} color="#34d399" />
              <Stat label="current"   value={run.current_step_keys.length} color="#22d3ee" />
              <Stat label="failed"    value={run.failed_step_keys.length} color="#f87171" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>还没运行过这个 workflow</p>
            <button onClick={startRun} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              Start Run
            </button>
          </div>
        )}
      </div>

      {/* Steps list */}
      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
        Steps ({steps.length})
      </p>
      <div className="space-y-2">
        {steps.map((s, i) => {
          const sr = stepRunByKey.get(s.step_key)
          const status = sr?.status ?? 'waiting'
          const meta = STEP_STATUS_META[status] ?? STEP_STATUS_META.waiting
          const Icon = meta.icon
          const isBottleneck = run?.bottleneck_step_key === s.step_key
          const cap = (s.metadata?.required_capability as string | undefined) ?? null
          const unit = (s.metadata?.suggested_execution_unit_type as string | undefined) ?? null
          return (
            <div key={s.id} className="glass rounded-xl p-3"
              style={isBottleneck ? { borderColor: meta.color, borderWidth: 1, borderStyle: 'solid' } : undefined}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={11} style={{ color: meta.color }}
                  className={status === 'running' ? 'animate-spin' : ''} />
                <code className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  {i + 1}. {s.step_key}
                </code>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ml-auto"
                  style={{ background: `${meta.color}15`, color: meta.color }}>
                  {status}
                </span>
                {sr && sr.attempt > 0 && (
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    attempt {sr.attempt}/{sr.max_attempts}
                  </span>
                )}
              </div>
              <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                {s.depends_on.length > 0 ? <>deps: {s.depends_on.join(', ')}</> : '(root step)'}
                {cap && <> · 能力: {cap}</>}
                {unit && <> · {unit}</>}
                {s.requires_approval && <> · 🛡 需 {s.approval_role}</>}
              </div>
              {sr?.error_message && (
                <p className="text-[10px] mt-1 text-red-400">⚠ {sr.error_message}</p>
              )}
              {sr?.next_retry_at && status === 'ready' && (
                <p className="text-[10px] mt-1 text-amber-400">
                  ⏱ retry scheduled {new Date(sr.next_retry_at).toLocaleString('zh-CN')}
                </p>
              )}
              {/* Per-step actions when there's an active step_run */}
              {sr && ['running','ready','blocked_approval'].includes(status) && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => complete(sr.id)} disabled={busy}
                    className="text-[10px] px-2 py-1 rounded disabled:opacity-40"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                    ✓ Complete
                  </button>
                  <button onClick={() => fail(sr.id)} disabled={busy}
                    className="text-[10px] px-2 py-1 rounded disabled:opacity-40"
                    style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
                    <X size={9} className="inline" /> Fail
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, total, color }: {
  label: string; value: number; total?: number; color: string
}) {
  return (
    <div className="rounded-lg p-2"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-mono" style={{ color }}>
        {value}{total !== undefined ? <span className="text-[10px] opacity-60"> / {total}</span> : null}
      </p>
    </div>
  )
}
