'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Project, ProjectStatus } from '@/types'
import { getProjects, createProject, updateProject, deleteProject } from '@/services/projects'

const statusLabel: Record<string, { label: string; style: string }> = {
  active:   { label: '进行中', style: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  maintain: { label: '维持',   style: 'bg-green-900/40 text-green-300 border-green-800' },
  frozen:   { label: '已冻结', style: 'bg-gray-800 text-gray-500 border-gray-700' },
  stopped:  { label: '已停止', style: 'bg-red-900/40 text-red-400 border-red-900' },
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    getProjects().then(setProjects).finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const p = await createProject({ name: newName.trim(), status: 'active' })
    setProjects(prev => [p, ...prev])
    setNewName('')
    setCreating(false)
  }

  async function handleStatusChange(id: string, status: ProjectStatus) {
    await updateProject(id, { status })
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除这个项目？')) return
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">项目</h1>
            <button onClick={() => setCreating(true)}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors">
              + 新建项目
            </button>
          </div>

          {creating && (
            <form onSubmit={handleCreate} className="mb-4 bg-gray-900 border border-gray-700 rounded-xl p-4 flex gap-3">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="项目名称..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none" />
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">创建</button>
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-gray-400 text-sm">取消</button>
            </form>
          )}

          {loading && <p className="text-gray-600 text-sm text-center py-12">加载中...</p>}

          {!loading && projects.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-sm">还没有项目</p>
              <button onClick={() => setCreating(true)} className="mt-3 text-blue-400 text-sm hover:text-blue-300">
                创建第一个项目
              </button>
            </div>
          )}

          <div className="space-y-4">
            {projects.map(p => (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-medium text-white">{p.name}</h2>
                    {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusLabel[p.status].style}`}>
                    {statusLabel[p.status].label}
                  </span>
                </div>

                {p.monthly_focus && (
                  <p className="text-sm text-gray-400 mb-3">本月重点：{p.monthly_focus}</p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(statusLabel) as ProjectStatus[]).filter(s => s !== p.status).map(s => (
                    <button key={s} onClick={() => handleStatusChange(p.id, s)}
                      className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-md transition-colors">
                      → {statusLabel[s].label}
                    </button>
                  ))}
                  <a href="/chat" className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-md transition-colors">
                    AI 分析
                  </a>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-xs px-2 py-1 text-gray-600 hover:text-red-400 rounded-md transition-colors ml-auto">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
