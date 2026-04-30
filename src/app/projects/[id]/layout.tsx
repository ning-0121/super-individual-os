'use client'
import { useEffect, useState, use } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { LayoutDashboard, MessageSquare, CheckSquare, Activity, Package, Wrench, Brain, FileText, Sparkles, ArrowLeft, ChevronRight } from 'lucide-react'

interface Project {
  id: string
  name: string
  status: string
  goal_statement: string
  description: string
  plan_generated: boolean
}

const TABS = [
  { key: 'overview',  href: '',           label: 'Overview',  icon: LayoutDashboard },
  { key: 'chat',      href: '/chat',      label: 'Chat',      icon: MessageSquare },
  { key: 'tasks',     href: '/tasks',     label: 'Tasks',     icon: CheckSquare },
  { key: 'runs',      href: '/runs',      label: 'Runs',      icon: Activity },
  { key: 'artifacts', href: '/artifacts', label: 'Artifacts', icon: Package },
  { key: 'tools',     href: '/tools',     label: 'Tools',     icon: Wrench },
  { key: 'memory',    href: '/memory',    label: 'Memory',    icon: Brain },
  { key: 'report',    href: '/report',    label: 'Report',    icon: FileText },
  { key: 'modules',   href: '/modules',   label: 'Modules',   icon: Sparkles },
]

export default function ProjectWorkspaceLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const pathname = usePathname()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(setProject)
      .finally(() => setLoading(false))
  }, [id])

  // Determine active tab from pathname suffix
  const segments = pathname.split('/').filter(Boolean) // ['projects', id, ...rest]
  const restPath = '/' + segments.slice(2).join('/')   // '' or '/chat' etc.
  const activeKey = TABS.find(t => {
    if (t.href === '') return restPath === '/' || restPath === ''
    return restPath.startsWith(t.href)
  })?.key ?? 'overview'

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">

        {/* Project header */}
        <div className="border-b border-[var(--border)] px-6 py-3 glass shrink-0">
          <div className="flex items-center gap-3 mb-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <Link href="/projects" className="flex items-center gap-1 hover:text-[var(--text-secondary)]">
              <ArrowLeft size={10} /> Portfolio
            </Link>
            <ChevronRight size={9} />
            <span className="font-mono uppercase tracking-widest text-[var(--accent-light)]">Project Workspace</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {loading ? '加载中...' : (project?.name ?? '(未找到项目)')}
              </h1>
              {project?.goal_statement && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{project.goal_statement}</p>
              )}
            </div>
            {project && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                {project.status}
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-[var(--border)] px-6 flex gap-1 overflow-x-auto glass shrink-0">
          {TABS.map(t => {
            const active = activeKey === t.key
            const Icon = t.icon
            const href = `/projects/${id}${t.href}`
            return (
              <Link key={t.key} href={href}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs transition-colors whitespace-nowrap"
                style={{
                  color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                }}>
                <Icon size={12} />
                {t.label}
              </Link>
            )
          })}
        </div>

        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
