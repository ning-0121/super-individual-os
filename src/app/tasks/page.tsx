'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Task, TaskStatus, TaskPriority, ExecutionUnit } from '@/types'
import { getTasks, createTask, updateTaskStatus, deleteTask, updateTask } from '@/services/tasks'
import { getExecutionUnits } from '@/services/execution-units'
import { dispatch } from '@/lib/ai/dispatch-engine'
import { Plus, Bot, User, Cpu, Clock, Zap, Filter } from 'lucide-react'

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

const UNIT_ICON: Record<string, React.FC<{ size?: number; className?: string }>> = {
  human: User, ai: Bot, agent: Cpu,
}
const UNIT_COLOR: Record<string, string> = {
  human: 'text-cyan-400', ai: 'text-violet-400', agent: 'text-emerald-400',
}

export default function TasksPage() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [units, setUnits]           = useState<ExecutionUnit[]>([])
  const [loading, setLoading]       = useState(true)
  const [newTitle, setNewTitle]     = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('important')
  const [newDueDate, setNewDueDate] = useState('')
  const [adding, setAdding]         = useState(false)
  // Filters
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all')
  const [filterUnit, setFilterUnit]         = useState<string>('all')

  useEffect(() => {
    Promise.all([getTasks(), getExecutionUnits()])
      .then(([t, u]) => { setTasks(t); setUnits(u) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = tasks.filter(t => {
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterUnit !== 'all' && t.execution_unit_id !== filterUnit) return false
    return true
  })

  async function handleMove(id: string, status: TaskStatus) {
    await updateTaskStatus(id, status)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return

    const newTask: Partial<Task> = {
      title: newTitle.trim(),
      status: 'todo',
      priority: newPriority,
      due_date: newDueDate || null,
    }

    // Auto-dispatch
    const mockTask = { ...newTask, id: '', user_id: '', project_id: null, description: '',
      assignee: '', execution_unit_id: null, created_at: '', updated_at: '' } as Task
    const result = dispatch(mockTask, units)
    if (result) newTask.execution_unit_id = result.recommended.id

    const t = await createTask(newTask)
    const unit = units.find(u => u.id === t.execution_unit_id)
    setTasks(prev => [{ ...t, execution_unit: unit }, ...prev])
    setNewTitle(''); setNewDueDate(''); setAdding(false)
  }

  async function handleDelete(id: string) {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleAssignUnit(taskId: string, unitId: string) {
    await updateTask(taskId, { execution_unit_id: unitId })
    const unit = units.find(u => u.id === unitId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, execution_unit_id: unitId, execution_unit: unit } : t))
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
          <div className="flex items-center gap-3">
            {/* Priority filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={11} style={{ color: 'var(--text-muted)' }} />
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as TaskPriority | 'all')}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <option value="all">所有优先级</option>
                <option value="must">MUST</option>
                <option value="important">IMPORTANT</option>
                <option value="optional">OPTIONAL</option>
              </select>
            </div>
            {/* Execution unit filter */}
            {units.length > 0 && (
              <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <option value="all">所有执行者</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.avatar} {u.name}</option>)}
              </select>
            )}
            <a href="/team" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              <Cpu size={11} /> 管理 Agents
            </a>
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
              <Plus size={12} /> 新建任务
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {adding && (
            <form onSubmit={handleAdd} className="glass rounded-xl p-4 flex flex-wrap gap-3 mb-5 items-end">
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="任务标题（AI 会自动推荐执行者）..."
                className="flex-1 min-w-48 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              {/* Priority selector */}
              <select value={newPriority} onChange={e => setNewPriority(e.target.value as TaskPriority)}
                className="text-xs rounded-lg px-2 py-2 focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <option value="must">MUST</option>
                <option value="important">IMPORTANT</option>
                <option value="optional">OPTIONAL</option>
              </select>
              {/* Due date */}
              <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
                className="text-xs rounded-lg px-2 py-2 focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', colorScheme: 'dark' }} />
              <button type="submit" className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--accent)' }}>添加</button>
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>取消</button>
            </form>
          )}

          {loading && <p className="text-center py-16 text-[var(--text-muted)] text-sm">加载中...</p>}

          {!loading && (
            <div className="grid grid-cols-4 gap-4 h-full min-h-0">
              {COLUMNS.map(col => {
                const colTasks = filtered.filter(t => t.status === col.id)
                return (
                  <div key={col.id} className="flex flex-col">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                      <span className="text-[10px] glass px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                        {colTasks.length}
                      </span>
                    </div>
                    <div className="flex-1 rounded-xl p-2 space-y-2 overflow-auto" style={{ background: 'rgba(13,17,30,0.4)', border: '1px solid var(--border)' }}>
                      {colTasks.length === 0 && (
                        <p className="text-[10px] text-center py-6" style={{ color: 'var(--text-muted)' }}>—</p>
                      )}
                      {colTasks.map(task => (
                        <TaskCard key={task.id} task={task}
                          units={units}
                          columns={COLUMNS.filter(c => c.id !== col.id)}
                          onMove={handleMove}
                          onDelete={handleDelete}
                          onAssign={handleAssignUnit} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function TaskCard({ task, units, columns, onMove, onDelete, onAssign }: {
  task: Task
  units: ExecutionUnit[]
  columns: typeof COLUMNS
  onMove: (id: string, status: TaskStatus) => void
  onDelete: (id: string) => void
  onAssign: (taskId: string, unitId: string) => void
}) {
  const pm = PRIORITY_META[task.priority]
  const unit = task.execution_unit ?? units.find(u => u.id === task.execution_unit_id)
  const [showAssign, setShowAssign] = useState(false)

  const UnitIcon = unit ? (UNIT_ICON[unit.type] ?? Zap) : Zap
  const unitColor = unit ? UNIT_COLOR[unit.type] : 'text-[var(--text-muted)]'

  // Format due date
  const dueDate = task.due_date ? new Date(task.due_date) : null
  const isOverdue = dueDate && dueDate < new Date() && task.status !== 'done'

  return (
    <div className={`glass rounded-lg p-3 border-l-4 ${pm.border} group relative`}>
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${pm.dot}`} />
        <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{task.title}</p>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded"
          style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {pm.label}
        </span>
        {dueDate && (
          <span className={`flex items-center gap-0.5 text-[9px] ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
            <Clock size={8} />
            {dueDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
            {isOverdue && ' ⚠'}
          </span>
        )}
      </div>

      {/* Execution unit badge */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowAssign(!showAssign)}
          className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded transition-colors ${unitColor}`}
          style={{ border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          <UnitIcon size={8} />
          <span>{unit ? unit.name : '未分配'}</span>
        </button>
      </div>

      {/* Assign dropdown */}
      {showAssign && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 glass-strong rounded-lg p-1 shadow-xl"
          style={{ border: '1px solid var(--border-strong)' }}>
          {units.map(u => {
            const Icon = UNIT_ICON[u.type] ?? Zap
            const color = UNIT_COLOR[u.type]
            return (
              <button key={u.id}
                onClick={() => { onAssign(task.id, u.id); setShowAssign(false) }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] hover:bg-white/5 transition-colors ${color}`}>
                <span>{u.avatar}</span>
                <Icon size={9} />
                <span>{u.name}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-1 flex-wrap mt-2">
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
