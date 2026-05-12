'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Loader2, GitBranch, Play, Plus, X, Sparkles, Clock, AlertTriangle,
  CheckCircle2, Pause, Trash2, ChevronRight,
} from 'lucide-react'

interface Workflow {
  id: string; name: string; description: string; status: string;
  step_count: number; created_at: string;
  latest_run: null | {
    id: string; status: string; started_at: string; finished_at: string | null
    bottleneck_step_key: string | null; completed: number; failed: number; current: number
  }
}

interface TemplateStep {
  step_key: string; name: string; description?: string
  depends_on: string[]; step_type?: string
  required_capability?: string; suggested_execution_unit_type?: string
  requires_approval?: boolean; approval_role?: string
  estimated_minutes?: number
}

interface Template {
  id: string; name: string; description: string
  category: string; estimated_duration_minutes: number
  steps: TemplateStep[]
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  running:          { color: '#34d399', label: 'Running'  },
  pending:          { color: '#22d3ee', label: 'Waiting'  },
  blocked_approval: { color: '#fbbf24', label: 'Blocked'  },
  failed:           { color: '#f87171', label: 'Failed'   },
  succeeded:        { color: '#34d399', label: 'Done'     },
  cancelled:        { color: '#94a3b8', label: 'Cancelled' },
}

export default function ProjectWorkflowsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/projects/${projectId}/workflows`).then(r => r.ok ? r.json() : { workflows: [] }),
      fetch('/api/workflow-templates').then(r => r.ok ? r.json() : { templates: [] }),
    ])
    setWorkflows(a.workflows ?? [])
    setTemplates(b.templates ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function forkFromTemplate(tpl: Template) {
    setCreating(true)
    const r = await fetch(`/api/projects/${projectId}/workflows`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: tpl.id }),
    })
    setCreating(false)
    if (!r.ok) { alert('创建失败'); return }
    const d = await r.json()
    setPreview(null)
    router.push(`/projects/${projectId}/workflows/${d.workflow.id}`)
  }

  async function startRun(wfId: string) {
    setStarting(wfId)
    const r = await fetch(`/api/workflows/${wfId}/run`, { method: 'POST' })
    setStarting(null)
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert('启动失败: ' + (e?.error?.message ?? r.statusText))
      return
    }
    router.push(`/projects/${projectId}/workflows/${wfId}`)
  }

  async function archive(wfId: string) {
    if (!confirm('归档这个 workflow？历史 run 仍然保留。')) return
    await fetch(`/api/workflows/${wfId}`, { method: 'DELETE' })
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-[var(--accent-light)]" />
      </div>
    )
  }

  const activeWorkflows = workflows.filter(w => w.status !== 'archived')

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-2 mb-4 text-cyan-400">
        <GitBranch size={14} />
        <h2 className="text-sm font-semibold uppercase tracking-wider">Workflows</h2>
        <button onClick={() => setShowCustom(true)}
          className="ml-auto flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
          <Plus size={10} /> Custom Workflow
        </button>
      </div>

      {/* Active list */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          项目工作流 ({activeWorkflows.length})
        </p>
        {activeWorkflows.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              还没有 workflow — 从下方模板库挑一个开始
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeWorkflows.map(w => {
              const lr = w.latest_run
              const meta = lr ? (STATUS_META[lr.status] ?? STATUS_META.pending) : null
              const pct = w.step_count > 0 && lr ? Math.round((lr.completed / w.step_count) * 100) : 0
              return (
                <div key={w.id} className="glass rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link href={`/projects/${projectId}/workflows/${w.id}`}
                          className="text-sm font-semibold hover:underline"
                          style={{ color: 'var(--text-primary)' }}>
                          {w.name}
                        </Link>
                        {meta && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                            style={{ background: `${meta.color}15`, color: meta.color }}>
                            {meta.label}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          · {w.step_count} steps
                        </span>
                      </div>
                      {w.description && (
                        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{w.description}</p>
                      )}
                      {lr && (
                        <>
                          <div className="h-1 rounded-full mb-1" style={{ background: 'var(--bg-elevated)' }}>
                            <div className="h-1 rounded-full"
                              style={{ width: `${pct}%`, background: meta?.color ?? '#22d3ee' }} />
                          </div>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <span>{lr.completed}/{w.step_count} 完成</span>
                            {lr.failed > 0 && <span className="text-red-400">{lr.failed} 失败</span>}
                            {lr.bottleneck_step_key && (
                              <span>bottleneck: <code className="font-mono">{lr.bottleneck_step_key}</code></span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => startRun(w.id)} disabled={starting === w.id}
                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded transition-all disabled:opacity-40"
                        style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                        {starting === w.id ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                        Start Run
                      </button>
                      <Link href={`/projects/${projectId}/workflows/${w.id}`}
                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded transition-all"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        Detail <ChevronRight size={9} />
                      </Link>
                      <button onClick={() => archive(w.id)}
                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded transition-all hover:text-red-400"
                        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <Trash2 size={9} /> Archive
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Template gallery */}
      <div>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Templates Library ({templates.length})
        </p>
        <div className="grid grid-cols-2 gap-2">
          {templates.map(t => (
            <button key={t.id} onClick={() => setPreview(t)}
              className="text-left glass rounded-xl p-3 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={11} className="text-violet-400" />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                <span className="ml-auto text-[9px] uppercase font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
                  {t.category}
                </span>
              </div>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span>{t.steps.length} steps</span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={9} /> ~{Math.round(t.estimated_duration_minutes / 60)}h
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal template={preview}
          creating={creating}
          onClose={() => setPreview(null)}
          onConfirm={() => forkFromTemplate(preview)} />
      )}

      {/* Custom builder modal */}
      {showCustom && (
        <CustomBuilderModal
          onClose={() => setShowCustom(false)}
          onCreate={async (payload) => {
            setCreating(true)
            const r = await fetch(`/api/projects/${projectId}/workflows`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            setCreating(false)
            if (!r.ok) {
              const e = await r.json().catch(() => ({}))
              alert('创建失败: ' + (e?.error?.message ?? r.statusText))
              return
            }
            const d = await r.json()
            setShowCustom(false)
            router.push(`/projects/${projectId}/workflows/${d.workflow.id}`)
          }}
          creating={creating} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────
// PreviewModal
// ─────────────────────────────────────────────────
function PreviewModal({ template, creating, onClose, onConfirm }: {
  template: Template; creating: boolean
  onClose: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="glass-strong rounded-xl p-5 max-w-2xl w-full max-h-[85vh] overflow-auto"
        style={{ border: '1px solid var(--border-strong)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-violet-400" />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{template.name}</p>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{template.description}</p>

        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Dependency graph ({template.steps.length} steps)
        </p>
        <div className="space-y-1.5 mb-4">
          {template.steps.map((s, i) => (
            <div key={s.step_key} className="text-[11px] p-2 rounded-lg"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <code className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--accent-light)' }}>
                  {i + 1}. {s.step_key}
                </code>
                <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                {s.requires_approval && (
                  <span className="text-[9px] px-1 py-0.5 rounded text-amber-400"
                    style={{ background: 'rgba(251,191,36,0.12)' }}>
                    approval: {s.approval_role}
                  </span>
                )}
                {s.suggested_execution_unit_type && (
                  <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {s.suggested_execution_unit_type}
                  </span>
                )}
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {s.depends_on.length > 0 ? `depends on: ${s.depends_on.join(', ')}` : '(no deps — runs first)'}
                {s.estimated_minutes ? ` · ~${s.estimated_minutes}m` : ''}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={creating}
            className="flex-1 text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(99,102,241,0.18)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Fork into this project
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// CustomBuilderModal
// Simple form-based builder. User adds named steps; for each, picks
// dependencies from already-added steps + optional capability.
// ─────────────────────────────────────────────────
interface DraftStep {
  step_key: string; name: string; depends_on: string[]
  required_capability?: string
}

function CustomBuilderModal({ onClose, onCreate, creating }: {
  onClose: () => void
  onCreate: (p: { name: string; description: string; steps: TemplateStep[] }) => void
  creating: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([])
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newDeps, setNewDeps] = useState<string[]>([])
  const [newCap, setNewCap] = useState('')

  function addStep() {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    if (!key || !newName.trim()) { alert('step_key 和 name 都必填'); return }
    if (steps.some(s => s.step_key === key)) { alert('step_key 重复'); return }
    setSteps(prev => [...prev, {
      step_key: key, name: newName.trim(),
      depends_on: newDeps, required_capability: newCap || undefined,
    }])
    setNewKey(''); setNewName(''); setNewDeps([]); setNewCap('')
  }

  function removeStep(key: string) {
    setSteps(prev => prev.filter(s => s.step_key !== key)
      .map(s => ({ ...s, depends_on: s.depends_on.filter(d => d !== key) })))
  }

  async function submit() {
    if (!name.trim()) { alert('workflow name 必填'); return }
    if (steps.length === 0) { alert('至少加一个 step'); return }
    onCreate({
      name: name.trim(), description: description.trim(),
      steps: steps.map(s => ({
        step_key: s.step_key, name: s.name,
        depends_on: s.depends_on,
        required_capability: s.required_capability,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="glass-strong rounded-xl p-5 max-w-2xl w-full max-h-[85vh] overflow-auto"
        style={{ border: '1px solid var(--border-strong)' }}>
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={14} className="text-cyan-400" />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Custom Workflow</p>
          <button onClick={onClose} className="ml-auto" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Workflow name (e.g. 上线首批客户邮件)"
          className="w-full text-xs px-3 py-2 rounded mb-2 focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          rows={2} placeholder="描述（选填）"
          className="w-full text-xs px-3 py-2 rounded mb-3 resize-none focus:outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />

        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Steps ({steps.length})
        </p>
        {steps.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {steps.map((s, i) => (
              <div key={s.step_key} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <code className="font-mono text-[10px] px-1 rounded text-cyan-400" style={{ background: 'rgba(34,211,238,0.1)' }}>
                  {i + 1}. {s.step_key}
                </code>
                <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                {s.depends_on.length > 0 && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    ← {s.depends_on.join(', ')}
                  </span>
                )}
                {s.required_capability && (
                  <span className="ml-auto text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {s.required_capability}
                  </span>
                )}
                <button onClick={() => removeStep(s.step_key)} className="hover:text-red-400" style={{ color: 'var(--text-muted)' }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add step form */}
        <div className="rounded-xl p-3 mb-4"
          style={{ background: 'var(--bg-base)', border: '1px dashed var(--border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Add step</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={newKey} onChange={e => setNewKey(e.target.value)}
              placeholder="step_key (e.g. research)"
              className="text-xs px-2 py-1.5 rounded focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="step name"
              className="text-xs px-2 py-1.5 rounded focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select multiple value={newDeps}
              onChange={e => setNewDeps(Array.from(e.target.selectedOptions).map(o => o.value))}
              className="text-xs px-2 py-1.5 rounded focus:outline-none h-16"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {steps.map(s => <option key={s.step_key} value={s.step_key}>{s.step_key}</option>)}
            </select>
            <input value={newCap} onChange={e => setNewCap(e.target.value)}
              placeholder="capability (writing/coding/...)"
              className="text-xs px-2 py-1.5 rounded focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <button onClick={addStep}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={9} /> Add step
          </button>
          {steps.length > 0 && (
            <p className="text-[9px] mt-2" style={{ color: 'var(--text-muted)' }}>
              依赖（cmd/ctrl-click 多选）：可选 {steps.map(s => s.step_key).join(', ')}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={creating}
            className="flex-1 text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(99,102,241,0.18)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Create Workflow
          </button>
        </div>
      </div>
    </div>
  )
}
