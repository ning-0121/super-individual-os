'use client'
import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { TaskStatus } from '@/types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: '本周待做' },
  { id: 'in_progress', label: '进行中' },
  { id: 'done', label: '已完成' },
  { id: 'paused', label: '已暂停' },
]

const SAMPLE_TASKS = [
  { id: '1', title: '完成第 3 个用户访谈', status: 'todo' as TaskStatus, priority: 'must', project: '超级个体 OS' },
  { id: '2', title: '发布 Landing Page', status: 'todo' as TaskStatus, priority: 'important', project: '超级个体 OS' },
  { id: '3', title: '搭建 Claude API 核心对话', status: 'in_progress' as TaskStatus, priority: 'must', project: '超级个体 OS' },
  { id: '4', title: '完成第 1 个用户访谈', status: 'done' as TaskStatus, priority: 'must', project: '超级个体 OS' },
  { id: '5', title: '完成第 2 个用户访谈', status: 'done' as TaskStatus, priority: 'must', project: '超级个体 OS' },
  { id: '6', title: '电商品牌增长', status: 'paused' as TaskStatus, priority: 'optional', project: '已冻结' },
]

const priorityStyle: Record<string, string> = {
  must: 'border-l-red-500',
  important: 'border-l-yellow-500',
  optional: 'border-l-gray-600',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState(SAMPLE_TASKS)

  function moveTask(id: string, status: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-1">Week 1</h2>
            <h1 className="text-2xl font-semibold text-white">执行看板</h1>
          </div>
          <button className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors">
            + 新建任务
          </button>
        </div>

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
                {tasks.filter(t => t.status === col.id).map(task => (
                  <div
                    key={task.id}
                    className={`bg-gray-800 border border-gray-700 border-l-4 ${priorityStyle[task.priority]}
                      rounded-lg p-3 text-sm`}
                  >
                    <div className="text-gray-100 mb-2">{task.title}</div>
                    <div className="text-xs text-gray-500 mb-2">{task.project}</div>
                    <div className="flex gap-1 flex-wrap">
                      {COLUMNS.filter(c => c.id !== col.id).map(c => (
                        <button
                          key={c.id}
                          onClick={() => moveTask(task.id, c.id)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
