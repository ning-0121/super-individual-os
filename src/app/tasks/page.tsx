'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Task, TaskStatus } from '@/types'
import { getTasks, createTask, updateTaskStatus, deleteTask } from '@/services/tasks'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo',        label: '本周待做' },
  { id: 'in_progress', label: '进行中' },
  { id: 'done',        label: '已完成' },
  { id: 'paused',      label: '已暂停' },
]

const priorityBorder: Record<string, string> = {
  must:      'border-l-red-500',
  important: 'border-l-yellow-500',
  optional:  'border-l-gray-600',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    getTasks().then(setTasks).finally(() => setLoading(false))
  }, [])

  async function handleMove(id: string, status: TaskStatus) {
    await updateTaskStatus(id, status)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    const t = await createTask({ title: newTitle.trim(), status: 'todo', priority: 'important' })
    setTasks(prev => [t, ...prev])
    setNewTitle('')
    setAdding(false)
  }

  async function handleDelete(id: string) {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">执行看板</h1>
          <button onClick={() => setAdding(true)}
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors">
            + 新建任务
          </button>
        </div>

        {adding && (
          <form onSubmit={handleAdd} className="mb-4 flex gap-3">
            <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="任务名称..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">添加</button>
            <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-gray-400 text-sm">取消</button>
          </form>
        )}

        {loading && <p className="text-gray-600 text-sm text-center py-16">加载中...</p>}

        {!loading && (
          <div className="grid grid-cols-4 gap-4 h-[calc(100vh-140px)]">
            {COLUMNS.map(col => (
              <div key={col.id} className="flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-300">{col.label}</span>
                  <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                    {tasks.filter(t => t.status === col.id).length}
                  </span>
                </div>
                <div className="flex-1 bg-gray-900/50 rounded-xl p-3 space-y-2 overflow-auto">
                  {tasks.filter(t => t.status === col.id).length === 0 && (
                    <p className="text-xs text-gray-700 text-center py-4">空</p>
                  )}
                  {tasks.filter(t => t.status === col.id).map(task => (
                    <div key={task.id}
                      className={`bg-gray-800 border border-gray-700 border-l-4 ${priorityBorder[task.priority]} rounded-lg p-3 text-sm`}>
                      <div className="text-gray-100 mb-2">{task.title}</div>
                      <div className="flex gap-1 flex-wrap">
                        {COLUMNS.filter(c => c.id !== col.id).map(c => (
                          <button key={c.id} onClick={() => handleMove(task.id, c.id)}
                            className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
                            → {c.label}
                          </button>
                        ))}
                        <button onClick={() => handleDelete(task.id)}
                          className="text-xs text-gray-700 hover:text-red-400 ml-auto transition-colors">
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
