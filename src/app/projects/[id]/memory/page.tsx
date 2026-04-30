'use client'
import { useEffect, useState, use } from 'react'
import { Loader2, Plus, X, Check, Brain } from 'lucide-react'
import type { MemoryType } from '@/types'

interface Memory {
  id: string; project_id: string | null; memory_type: MemoryType;
  content: string; importance: number; created_at: string;
}

const MEMORY_ICONS: Record<string, string> = {
  goal: '◎', personality: '◉', preference: '◈', project: '▣',
  decision: '⬡', risk: '⚠', failure: '✕', success: '✓',
}

export default function ProjectMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType]   = useState<MemoryType>('goal')
  const [newImportance, setNewImportance] = useState(3)
  const [scope, setScope]       = useState<'all'|'project'|'user'>('all')
  const [isUserLevel, setIsUserLevel] = useState(false)

  async function load() {
    const r = await fetch(`/api/projects/${projectId}/memory?scope=${scope}`)
    if (r.ok) setMemories(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, projectId])

  async function add() {
    if (!newContent.trim()) return
    await fetch(`/api/projects/${projectId}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memory_type: newType, content: newContent.trim(),
        importance: newImportance, is_user_level: isUserLevel,
      }),
    })
    setNewContent(''); setAdding(false); load()
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header + scope toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all','project','user'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className="text-[10px] px-2.5 py-1 rounded-lg"
              style={{
                background: scope === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${scope === s ? 'var(--border-strong)' : 'var(--border)'}`,
                color: scope === s ? 'var(--accent-light)' : 'var(--text-muted)',
              }}>
              {s === 'all' ? '全部' : s === 'project' ? '本项目' : '用户级'}
            </button>
          ))}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
          <Plus size={11} /> 新增记忆
        </button>
      </div>

      {/* Add modal */}
      {adding && (
        <div className="glass-strong rounded-xl p-4 mb-4" style={{ border: '1px solid var(--border-strong)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>添加记忆</p>
            <button onClick={() => setAdding(false)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label-xs">类型</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(MEMORY_ICONS).map(t => (
                  <button key={t} onClick={() => setNewType(t as MemoryType)}
                    className="text-[10px] px-2 py-1 rounded"
                    style={{
                      background: newType === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                      border: `1px solid ${newType === t ? 'var(--accent)' : 'var(--border)'}`,
                      color: newType === t ? 'var(--accent-light)' : 'var(--text-muted)',
                    }}>
                    {MEMORY_ICONS[t]} {t}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={3}
              placeholder="记忆内容..."
              className="w-full rounded px-3 py-2 text-xs resize-none focus:outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>重要度</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setNewImportance(n)}
                    style={{ color: n <= newImportance ? '#f59e0b' : 'var(--border-strong)' }}>★</button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[10px] ml-4 cursor-pointer">
                <input type="checkbox" checked={isUserLevel} onChange={e => setIsUserLevel(e.target.checked)} />
                <span style={{ color: 'var(--text-secondary)' }}>用户级（跨项目共享）</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={add} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white"
                style={{ background: 'var(--accent)' }}>
                <Check size={11} /> 保存
              </button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs"
                style={{ color: 'var(--text-muted)' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}

      {!loading && memories.length === 0 && (
        <div className="text-center py-16">
          <Brain size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] text-sm">本项目还没有任何记忆</p>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {memories.map(m => (
          <div key={m.id} className="glass rounded-lg p-3 flex items-start gap-3">
            <span className="text-base shrink-0" style={{ color: 'var(--accent-light)' }}>{MEMORY_ICONS[m.memory_type]}</span>
            <div className="flex-1">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{m.content}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {m.memory_type}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.project_id ? 'text-[var(--accent-light)]' : 'text-amber-400'}`}
                  style={{ background: 'var(--bg-base)', border: `1px solid ${m.project_id ? 'rgba(99,102,241,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
                  {m.project_id ? '项目级' : '用户级'}
                </span>
                <div className="flex">
                  {Array.from({ length: m.importance }).map((_, i) => (
                    <span key={i} className="text-amber-400" style={{ fontSize: '8px' }}>★</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
