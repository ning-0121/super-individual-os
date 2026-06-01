'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { Project, ProjectStatus } from '@/types'
import { getProjects, updateProject, deleteProject } from '@/services/projects'
import { Plus, Trash2, ChevronRight } from 'lucide-react'

const DECISION_OPTIONS = ['Continue', 'Pivot', 'Freeze', 'Stop'] as const
type Decision = typeof DECISION_OPTIONS[number]

const STATUS_META: Record<string, { label: string; style: string }> = {
  active:   { label: '进行中', style: 'status-active' },
  maintain: { label: '维持',   style: 'status-maintain' },
  frozen:   { label: '已冻结', style: 'status-frozen' },
  stopped:  { label: '已停止', style: 'status-stopped' },
}

const DECISION_META: Record<Decision, string> = {
  Continue: 'text-emerald-400 border-emerald-800 bg-emerald-950/30',
  Pivot:    'text-amber-400 border-amber-800 bg-amber-950/30',
  Freeze:   'text-slate-400 border-slate-700 bg-slate-900/30',
  Stop:     'text-red-400 border-red-900 bg-red-950/30',
}

export default function ProjectsPage() {
  const [projects, setProjects]     = useState<Project[]>([])
  const [loading, setLoading]       = useState(true)
  const [decisions, setDecisions]   = useState<Record<string, Decision>>({})

  useEffect(() => {
    getProjects().then(setProjects).finally(() => setLoading(false))
  }, [])

  async function handleStatus(id: string, status: ProjectStatus) {
    await updateProject(id, { status })
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除？')) return
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  function setDecision(id: string, d: Decision) {
    setDecisions(prev => ({ ...prev, [id]: d }))
  }

  const grouped = {
    active:   projects.filter(p => p.status === 'active'),
    maintain: projects.filter(p => p.status === 'maintain'),
    frozen:   projects.filter(p => p.status === 'frozen'),
    stopped:  projects.filter(p => p.status === 'stopped'),
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass">
          <div>
            <p className="text-xs font-mono text-[var(--accent-light)] tracking-widest uppercase mb-0.5">Portfolio View</p>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">项目组合</h1>
          </div>
          <Link href="/projects/new"
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 新建 / 导入项目
          </Link>
        </div>

        <div className="p-8">
          {loading && <p className="text-center py-20 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && projects.length === 0 && (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)] text-sm mb-4">暂无项目</p>
              <Link href="/projects/new" className="text-[var(--accent-light)] text-sm hover:text-white transition-colors">
                新建 / 导入第一个项目 →
              </Link>
            </div>
          )}

          {/* Active projects - prominent */}
          {grouped.active.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
                活跃项目 <span className="ml-1 text-[var(--accent-light)]">{grouped.active.length}</span>
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {grouped.active.map(p => (
                  <ProjectCard key={p.id} p={p} decision={decisions[p.id]}
                    onDecision={d => setDecision(p.id, d)}
                    onStatus={s => handleStatus(p.id, s)}
                    onDelete={() => handleDelete(p.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Other projects */}
          {(grouped.maintain.length > 0 || grouped.frozen.length > 0 || grouped.stopped.length > 0) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
                其他项目
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[...grouped.maintain, ...grouped.frozen, ...grouped.stopped].map(p => (
                  <ProjectCard key={p.id} p={p} decision={decisions[p.id]} compact
                    onDecision={d => setDecision(p.id, d)}
                    onStatus={s => handleStatus(p.id, s)}
                    onDelete={() => handleDelete(p.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function ProjectCard({
  p, decision, compact, onDecision, onStatus, onDelete
}: {
  p: Project; decision?: Decision; compact?: boolean
  onDecision: (d: Decision) => void
  onStatus: (s: ProjectStatus) => void
  onDelete: () => void
}) {
  const statusMeta = STATUS_META[p.status]
  return (
    <div className="glass glass-hover rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <a href={`/projects/${p.id}`}
            className="text-sm font-semibold hover:text-[var(--accent-light)] transition-colors"
            style={{ color: 'var(--text-primary)' }}>
            {p.name} →
          </a>
          {!compact && p.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded border ${statusMeta.style}`}>{statusMeta.label}</span>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!compact && p.monthly_focus && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>本月重点：</span>{p.monthly_focus}
        </p>
      )}

      {/* Decision buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {DECISION_OPTIONS.map(d => (
          <button key={d} onClick={() => onDecision(d)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              decision === d ? DECISION_META[d] : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
            }`}>
            {d}
          </button>
        ))}
      </div>

      {!compact && (
        <div className="flex gap-2 mt-1">
          <a href="/chat" className="flex items-center gap-1 text-[10px] transition-colors" style={{ color: 'var(--accent-light)' }}>
            AI 分析 <ChevronRight size={9} />
          </a>
          <span style={{ color: 'var(--border)' }}>|</span>
          {p.status !== 'frozen' && (
            <button onClick={() => onStatus('frozen')} className="text-[10px] transition-colors" style={{ color: 'var(--text-muted)' }}>
              冻结
            </button>
          )}
          {p.status === 'frozen' && (
            <button onClick={() => onStatus('active')} className="text-[10px] transition-colors" style={{ color: 'var(--text-muted)' }}>
              重新激活
            </button>
          )}
        </div>
      )}
    </div>
  )
}
