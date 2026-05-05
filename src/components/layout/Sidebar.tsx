'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, MessageSquare, FolderOpen, CheckSquare,
  Brain, Bot, Layers, ClipboardCheck, Wrench, LogOut, ShieldCheck, Eye, ShieldAlert,
  Activity, TrendingUp, Compass, Network, ListChecks, GitBranch,
} from 'lucide-react'

const nav = [
  {
    group: 'Command',
    items: [
      { href: '/mission-control', label: 'Mission Control', icon: Activity },
      { href: '/systems',         label: 'Systems',         icon: Network },
      { href: '/dashboard',       label: 'CEO Brief',       icon: LayoutDashboard },
    ],
  },
  {
    group: 'Execution',
    items: [
      { href: '/projects',        label: 'Projects',        icon: FolderOpen },
      { href: '/command-center',  label: 'Command Center',  icon: Layers },
      { href: '/tasks',           label: 'Tasks',           icon: CheckSquare },
      { href: '/approvals',       label: 'Approvals',       icon: ShieldAlert },
      { href: '/reviews',         label: 'Reviews',         icon: ClipboardCheck },
    ],
  },
  {
    group: 'Organization',
    items: [
      { href: '/chat',            label: 'AI Co-founder',   icon: MessageSquare },
      { href: '/agents',          label: 'AI Workforce',    icon: Bot },
      { href: '/managers',        label: 'Managers',        icon: GitBranch },
      { href: '/policies',        label: 'Policies',        icon: ListChecks },
    ],
  },
  {
    group: 'Growth',
    items: [
      { href: '/market-radar',    label: 'Market Radar',    icon: Compass },
      { href: '/growth',          label: 'Growth Experiments', icon: TrendingUp },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/tools',             label: 'Tools',          icon: Wrench },
      { href: '/settings',          label: 'Second Brain',   icon: Brain },
      { href: '/system-readiness',  label: 'Beta Readiness', icon: ShieldCheck },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.ok ? r.json() : { is_admin: false })
      .then(d => setIsAdmin(!!d.is_admin))
      .catch(() => {})
  }, [])

  async function logout() {
    await createClient().auth.signOut()
    router.push('/auth/login'); router.refresh()
  }

  return (
    <aside className="w-52 border-r border-[var(--border)] flex flex-col py-4 px-2 shrink-0"
      style={{ background: 'rgba(7,8,15,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="px-3 mb-5">
        <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: 'var(--accent-light)' }}>Super OS</p>
        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Multi-Agent Execution OS</p>
      </div>

      <nav className="flex-1 overflow-auto space-y-4">
        {nav.concat(isAdmin ? [{
          group: 'Admin',
          items: [{ href: '/admin/runs', label: 'All Runs', icon: Eye }],
        }] : []).map(group => (
          <div key={group.group}>
            <p className="text-[9px] font-semibold uppercase tracking-widest px-3 mb-1"
              style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
                      active ? 'text-[var(--accent-light)] font-medium' : 'hover:text-[var(--text-secondary)]'
                    }`}
                    style={active
                      ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }
                      : { color: 'var(--text-muted)', border: '1px solid transparent' }}>
                    <Icon size={13} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <button onClick={logout}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors mt-2"
        style={{ color: 'var(--text-muted)', border: '1px solid transparent' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
        <LogOut size={13} /> 退出
      </button>
    </aside>
  )
}
