'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Task, TaskStatus } from '@/types'
import { getTasks, createTask, updateTaskStatus, deleteTask } from '@/services/tasks'
import { Plus, Zap, Bot, User, Clock } from 'lucide-react'

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo',        label: 'Focus Queue', color: 'text-[var(--accent-light)]' },
  { id: 'in_progress', label: 'In Progress',  color: 'text-cyan-400' },
  { id: 'done',        label: 'Done',         color: 'text-emerald-400' },
  { id: 'paused',      label: 'Blocked',      color: 'text-amber-400' },
]

const PRIORITY_META: Record<string, { border: string; label: string; dot: string }> = {
  must:      { border: 'border-l-red-500',    label: 'MUST',      dot: 'bg-red-400' },
  important: { border: 'border-l-amber-500',  label: 'IMPORTANT', dot: 'bg-amber-400' },
  optional:  { border: 'border-l-slate-600',  label: 'OPTIONAL',  dot: 'bg-slate-500' },
}

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding]   = useState(false)

  useEffect(() => { getTasks().then(setTasks).finally(() => setLoading(false)) }, [])

  async function handleMove(id: string, status: TaskStatus) {
    await updateTaskStatus(id, status)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const t = await createTask({ title: newTitle.trim(), status: 'todo', priority: 'important' })
    setTasks(prev => [t, ...prev])
    setNewTitle(''); setAdding(false)
  }

  async function handleDelete(id: string) {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 flex items-center justify-between glass shrink-0">
          <div>
            <p className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-0.5">Execution OS</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>执行看板</h1>
          </div>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={12} /> 新建任务
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {adding && (
            <form onSubmit={handleAdd} className="glass rounded-xl p-3 flex gap-3 mb-5">
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="任务标题..."
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <button type="submit" className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--accent)' }}>添加</button>
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>取消</button>
            </form>
          )}

          {loading && <p className="text-center py-16 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && (
            <div className="grid grid-cols-4 gap-4 h-full min-h-0">
              {COLUMNS.map(col => (
                <div key={col.id} className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                    <span className="text-[10px] glass px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                      {tasks.filter(t => t.status === col.id).length}
                    </span>
                  </div>
                  <div className="flex-1 rounded-xl p-2 space-y-2 overflow-auto" style={{ background: 'rgba(13,17,30,0.4)', border: '1px solid var(--border)' }}>
                    {tasks.filter(t => t.status === col.id).length === 0 && (
                      <p className="text-[10px] text-center py-6" style={{ color: 'var(--text-muted)' }}>—</p>
                    )}
                    {tasks.filter(t => t.status === col.id).map(task => (
                      <TaskCard key={task.id} task={task}
                        columns={COLUMNS.filter(c => c.id !== col.id)}
                        onMove={handleMove} onDelete={handleDelete} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function TaskCard({ task, columns, onMove, onDelete }: {
  task: Task
  columns: typeof COLUMNS
  onMove: (id: string, status: TaskStatus) => void
  onDelete: (id: string) => void
}) {
  const pm = PRIORITY_META[task.priority]
  return (
    <div className={`glass rounded-lg p-3 border-l-4 ${pm.border} group`}>
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${pm.dot}`} />
        <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{task.title}</p>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {pm.label}
        </span>
        {task.assignee === 'ai' && <Bot size={9} className="text-[var(--accent-light)]" />}
        {task.assignee === 'self' && <User size={9} style={{ color: 'var(--text-muted)' }} />}
        {task.due_date && <Clock size={9} className="text-amber-400" />}
      </div>

      <div className="flex gap-1 flex-wrap">
        {columns.map(c => (
          <button key={c.id} onClick={() => onMove(task.id, c.id)}
            className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            → {c.label}
          </button>
        ))}
        <button onClick={() => onDelete(task.id)}
          className="text-[9px] px-1.5 py-0.5 rounded ml-auto transition-colors hover:text-red-400"
          style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>
    </div>
  )
}
