'use client'
import { useEffect, useState, use } from 'react'
import { Loader2, GitBranch, FileText, Package, ExternalLink } from 'lucide-react'

interface Artifact {
  id: string; artifact_type: string; title: string; url: string; content: string;
  metadata: Record<string, unknown>; created_at: string; task_id: string | null;
}

const TYPE_META: Record<string, { label: string; color: string; icon: typeof Package }> = {
  code_pr:         { label: 'PR',       color: 'text-emerald-400', icon: GitBranch },
  issue:           { label: 'Issue',    color: 'text-cyan-400',    icon: GitBranch },
  markdown_doc:    { label: '文档',     color: 'text-violet-400',  icon: FileText },
  json_data:       { label: '数据',     color: 'text-amber-400',   icon: Package },
  design_spec:     { label: '设计稿',   color: 'text-pink-400',    icon: Package },
  research_report: { label: '调研报告', color: 'text-blue-400',    icon: FileText },
  other:           { label: '其它',     color: 'text-slate-400',   icon: Package },
}

export default function ProjectArtifactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch(`/api/projects/${projectId}/artifacts`).then(r => r.json())
      .then(d => setArtifacts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [projectId])

  const filtered = filter === 'all' ? artifacts : artifacts.filter(a => a.artifact_type === filter)
  const types = [...new Set(artifacts.map(a => a.artifact_type))]

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>

  if (artifacts.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <Package size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
        <p className="text-[var(--text-muted)] text-sm">本项目还没有产出物</p>
        <p className="text-[var(--text-muted)] text-xs mt-2">Agent 执行任务后会自动生成 PR / 文档 / 设计稿等</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">

      {/* Type filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('all')}
          className="text-[10px] px-2 py-1 rounded-lg"
          style={{
            background: filter === 'all' ? 'rgba(99,102,241,0.15)' : 'transparent',
            border: `1px solid ${filter === 'all' ? 'var(--border-strong)' : 'var(--border)'}`,
            color: filter === 'all' ? 'var(--accent-light)' : 'var(--text-muted)',
          }}>
          全部 ({artifacts.length})
        </button>
        {types.map(t => {
          const m = TYPE_META[t] ?? TYPE_META.other
          const count = artifacts.filter(a => a.artifact_type === t).length
          return (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-[10px] px-2 py-1 rounded-lg ${m.color}`}
              style={{
                background: filter === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${filter === t ? 'var(--border-strong)' : 'var(--border)'}`,
              }}>
              {m.label} ({count})
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map(a => {
          const meta = TYPE_META[a.artifact_type] ?? TYPE_META.other
          const Icon = meta.icon
          const filesWritten = Array.isArray(a.metadata?.files_written) ? a.metadata.files_written as unknown[] : []
          return (
            <div key={a.id} className="glass rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Icon size={12} className={`${meta.color} mt-0.5 shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                    <span className={`text-[9px] ${meta.color}`}>{meta.label}</span>
                  </div>
                </div>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="text-[10px] flex items-center gap-0.5 shrink-0"
                    style={{ color: 'var(--accent-light)' }}>
                    打开 <ExternalLink size={9} />
                  </a>
                )}
              </div>
              {filesWritten.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 ml-5">
                  {filesWritten.slice(0, 4).map((f, i) => (
                    <code key={i} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {String(f)}
                    </code>
                  ))}
                  {filesWritten.length > 4 && (
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>+{filesWritten.length - 4}</span>
                  )}
                </div>
              )}
              <p className="text-[9px] mt-2" style={{ color: 'var(--text-muted)' }}>
                {new Date(a.created_at).toLocaleString('zh-CN')}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
