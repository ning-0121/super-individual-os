'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, GitBranch } from 'lucide-react'

interface Project { id: string; name: string }
interface Manager { id: string; project_id: string; role: string; name: string; avatar: string; description: string; authority_level: number }

export default function ManagersPage() {
  const [data, setData] = useState<{ projects: Project[]; managersByProject: Record<string, Manager[]> } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const projRes = await fetch('/api/projects').catch(() => null)
      const projects: Project[] = projRes && projRes.ok ? await projRes.json() : []

      const managersByProject: Record<string, Manager[]> = {}
      for (const p of projects) {
        const r = await fetch(`/api/projects/${p.id}/managers`).catch(() => null)
        if (r && r.ok) managersByProject[p.id] = await r.json()
      }
      setData({ projects, managersByProject })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Organization</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Managers</h1>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            每个项目自动有 7 个经理（CEO + 6 个领域经理），按 authority_level 决策
          </p>
        </div>
        <div className="flex-1 overflow-auto p-6 max-w-5xl">
          {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}

          {!loading && data && data.projects.length === 0 && (
            <div className="text-center py-16">
              <GitBranch size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>没有项目</p>
            </div>
          )}

          {!loading && data && data.projects.map(p => {
            const managers = data.managersByProject[p.id] ?? []
            return (
              <div key={p.id} className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  {p.name}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {managers.map(m => (
                    <div key={m.id} className="glass rounded-lg p-3 flex items-center gap-2">
                      <span className="text-base">{m.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{m.name}</p>
                        <p className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{m.role}</p>
                      </div>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>L{m.authority_level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
