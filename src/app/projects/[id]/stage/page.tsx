'use client'
import { useEffect, useState, use } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Lock, ChevronRight, ArrowRight, RotateCcw, X, AlertCircle } from 'lucide-react'

interface StageDef {
  id: number; key: string;
  name_zh: string; name_en: string;
  short: string; goal: string; success_criteria: string;
  required_artifact_types: string[]; recommended_agents: string[];
  default_metric?: { name: string; target: number; label: string };
  can_skip: boolean;
  outcome_options?: string[];
}

interface MetricStatus { name: string; label: string; target: number; current: number; ok: boolean }

interface GateResult {
  stage: StageDef;
  can_advance: boolean;
  blockers: string[];
  warnings: string[];
  artifacts_present: Record<string, number>;
  memory_count: number;
  metric_status: MetricStatus | null;
}

interface HistoryEntry { from: number; to: number; outcome: string; ts: string; note?: string }

interface StageData {
  current_stage: number;
  total_stages: number;
  stages: StageDef[];
  history: HistoryEntry[];
  gate: GateResult;
}

const OUTCOME_LABEL: Record<string, string> = {
  succeeded: '成功', failed: '失败', pivoted: '转向', manual: '手动',
}
const OUTCOME_COLOR: Record<string, string> = {
  succeeded: '#34d399', failed: '#f87171', pivoted: '#fbbf24', manual: '#94a3b8',
}

export default function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [data, setData]     = useState<StageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [showOutcomeModal, setShowOutcomeModal] = useState(false)
  const [outcomeNote, setOutcomeNote] = useState('')

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/projects/${projectId}/stage`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function transition(toStage: number, outcome?: string, force = false) {
    setAdvancing(true)
    const res = await fetch(`/api/projects/${projectId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_stage: toStage, outcome, force, note: outcomeNote || undefined }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`切换失败：${err?.error?.message ?? '未知错误'}\n${err?.error?.detail?.blockers?.join('\n') ?? ''}`)
    } else {
      await load()
      setShowOutcomeModal(false)
      setOutcomeNote('')
    }
    setAdvancing(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>
  if (!data) return <p className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>无法加载阶段数据</p>

  const { current_stage, total_stages, stages, history, gate } = data
  const currentStageDef = stages.find(s => s.id === current_stage)!

  return (
    <div className="p-6 max-w-5xl">

      {/* Hero — current stage status */}
      <div className="glass-strong rounded-xl p-5 mb-6"
        style={{ border: '1px solid var(--border-strong)' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-mono font-bold"
              style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--accent-light)', border: '2px solid var(--accent)' }}>
              {current_stage}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent-light)] mb-0.5">
                Stage {current_stage} / {total_stages}
              </p>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {currentStageDef.name_zh}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{currentStageDef.short}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            {gate.can_advance ? (
              <button onClick={() => {
                if (currentStageDef.outcome_options) setShowOutcomeModal(true)
                else transition(current_stage + 1, 'manual')
              }} disabled={advancing || current_stage >= total_stages}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                {advancing ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                进入下一阶段
              </button>
            ) : (
              <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded"
                style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                <Lock size={10} /> 闸门未通过
              </span>
            )}
            {current_stage > 1 && (
              <button onClick={() => transition(current_stage - 1, 'pivoted', true)} disabled={advancing}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded disabled:opacity-40"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <RotateCcw size={9} /> 退回
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs mt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>阶段目标</p>
            <p style={{ color: 'var(--text-secondary)' }}>{currentStageDef.goal}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>完成标准</p>
            <p style={{ color: 'var(--text-secondary)' }}>{currentStageDef.success_criteria}</p>
          </div>
        </div>

        {/* Gate status */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            闸门检查
          </p>
          {gate.blockers.length === 0 && gate.warnings.length === 0 && (
            <p className="text-xs flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={11} /> 全部通过
            </p>
          )}
          {gate.blockers.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider mb-1 text-red-400">必须解决</p>
              <ul className="space-y-1">
                {gate.blockers.map((b, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5 text-red-400">
                    <X size={10} className="mt-0.5 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gate.warnings.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider mb-1 text-amber-400">提示（不阻塞）</p>
              <ul className="space-y-1">
                {gate.warnings.map((w, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5 text-amber-400">
                    <AlertCircle size={10} className="mt-0.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Metric */}
        {gate.metric_status && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <span>{gate.metric_status.label}</span>
              <span className={gate.metric_status.ok ? 'text-emerald-400' : 'text-amber-400'}>
                {gate.metric_status.current} / {gate.metric_status.target}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (gate.metric_status.current / gate.metric_status.target) * 100)}%`,
                  background: gate.metric_status.ok ? '#34d399' : 'var(--accent)',
                }} />
            </div>
          </div>
        )}

        {/* Recommended agents */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            本阶段推荐 Agent
          </p>
          <div className="flex flex-wrap gap-1.5">
            {currentStageDef.recommended_agents.map(a => (
              <code key={a} className="text-[10px] px-2 py-0.5 rounded font-mono"
                style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--accent-light)', border: '1px solid var(--border)' }}>
                {a}
              </code>
            ))}
          </div>
        </div>
      </div>

      {/* Vertical pipeline */}
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
        全部阶段
      </p>
      <div className="relative pl-3 pb-2">
        {/* Vertical line */}
        <div className="absolute left-7 top-2 bottom-2 w-0.5"
          style={{ background: 'var(--border)' }} />

        {stages.map(s => {
          const isPast    = s.id < current_stage
          const isCurrent = s.id === current_stage
          const isFuture  = s.id > current_stage

          const dotBg = isCurrent ? 'var(--accent)' : isPast ? '#34d399' : 'transparent'
          const dotBorder = isCurrent ? 'var(--accent)' : isPast ? '#34d399' : 'var(--border-strong)'
          const dotColor = isCurrent ? 'white' : isPast ? 'white' : 'var(--text-muted)'

          return (
            <div key={s.id} className="relative flex gap-4 pb-5">
              <div className="relative z-10 shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{ background: dotBg, border: `2px solid ${dotBorder}`, color: dotColor }}>
                  {isPast ? '✓' : s.id}
                </div>
              </div>
              <div className={`flex-1 pt-1 ${isFuture ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: isCurrent ? 'var(--accent-light)' : 'var(--text-primary)' }}>
                    {s.id}. {s.name_zh}
                  </p>
                  {isCurrent && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-[var(--accent-light)]"
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid var(--border-strong)' }}>
                      当前
                    </span>
                  )}
                  {s.can_skip && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      可跳过
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.short} · {s.goal}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="glass rounded-xl p-5 mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            阶段切换历史
          </p>
          <div className="space-y-2">
            {[...history].reverse().slice(0, 10).map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                  {new Date(h.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>Stage {h.from}</span>
                <ChevronRight size={9} />
                <span>Stage {h.to}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px]"
                  style={{ color: OUTCOME_COLOR[h.outcome] ?? '#94a3b8', background: `${OUTCOME_COLOR[h.outcome] ?? '#94a3b8'}15`, border: `1px solid ${OUTCOME_COLOR[h.outcome] ?? '#94a3b8'}40` }}>
                  {OUTCOME_LABEL[h.outcome] ?? h.outcome}
                </span>
                {h.note && <span className="italic" style={{ color: 'var(--text-muted)' }}>· {h.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outcome modal (for stage 10) */}
      {showOutcomeModal && currentStageDef.outcome_options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="glass-strong rounded-xl p-6 w-full max-w-md" style={{ border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                推进到下一阶段 — 结果判定
              </h3>
              <button onClick={() => setShowOutcomeModal(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              当前阶段「{currentStageDef.name_zh}」需要明确判定结果，作为长期记忆。
            </p>
            <textarea value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)}
              placeholder="备注（如：定价 99/月，3 个种子用户付费——验证成功）"
              rows={3}
              className="w-full rounded px-3 py-2 text-xs resize-none focus:outline-none mb-3"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <div className="grid grid-cols-3 gap-2">
              {currentStageDef.outcome_options.map(o => {
                const color = OUTCOME_COLOR[o] ?? '#94a3b8'
                return (
                  <button key={o} onClick={() => transition(current_stage + 1, o)}
                    className="text-xs py-2 rounded-lg transition-all"
                    style={{ background: `${color}15`, border: `1px solid ${color}40`, color }}>
                    {OUTCOME_LABEL[o] ?? o}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
