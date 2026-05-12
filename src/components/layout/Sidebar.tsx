'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, MessageSquare, FolderOpen, CheckSquare,
  Brain, Bot, Layers, ClipboardCheck, Wrench, LogOut, ShieldCheck, Eye, ShieldAlert,
  Activity, TrendingUp, Compass, Network, ListChecks, GitBranch,
  ChevronDown, ChevronRight, type LucideIcon,
} from 'lucide-react'

// ─────────────────────────────────────────────────
// V2.3 — Pinned core (always visible) + collapsible groups
// ─────────────────────────────────────────────────
type Item = { href: string; label: string; icon: LucideIcon; badgeKey?: 'pending_approvals' }

const PINNED: Item[] = [
  { href: '/mission-control', label: 'Mission Control', icon: Activity },
  { href: '/systems',         label: 'Systems',         icon: Network },
  { href: '/approvals',       label: 'Approvals',       icon: ShieldAlert, badgeKey: 'pending_approvals' },
  { href: '/chat',            label: 'AI Co-founder',   icon: MessageSquare },
]

const GROUPS: Array<{ group: string; items: Item[] }> = [
  {
    group: 'Execution',
    items: [
      { href: '/projects',        label: 'Projects',        icon: FolderOpen },
      { href: '/tasks',           label: 'Tasks',           icon: CheckSquare },
      { href: '/command-center',  label: 'Command Center',  icon: Layers },
      { href: '/reviews',         label: 'Reviews',         icon: ClipboardCheck },
      { href: '/dashboard',       label: 'CEO Brief',       icon: LayoutDashboard },
    ],
  },
  {
    group: 'Organization',
    items: [
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
      { href: '/tools/autonomy',    label: 'Tool Autonomy',  icon: ShieldCheck },
      { href: '/cost',              label: 'Cost',           icon: TrendingUp },
      { href: '/settings',          label: 'Second Brain',   icon: Brain },
      { href: '/system-readiness',  label: 'Beta Readiness', icon: ShieldCheck },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [counts, setCounts] = useState<{ pending_approvals: number }>({ pending_approvals: 0 })

  // Auto-expand the group containing the current route
  const initialOpenGroup = useMemo(() => {
    const g = GROUPS.find(g => g.items.some(i => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(i.href))))
    return g?.group ?? null
  }, [pathname])
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(initialOpenGroup ? [initialOpenGroup] : []),
  )

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.ok ? r.json() : { is_admin: false })
      .then(d => setIsAdmin(!!d.is_admin))
      .catch(() => {})

    fetch('/api/approval-requests?status=pending')
      .then(r => r.ok ? r.json() : [])
      .then(d => setCounts({ pending_approvals: Array.isArray(d) ? d.length : 0 }))
      .catch(() => {})
  }, [pathname])

  function toggle(group: string) {
    setOpenGroups(s => {
      const n = new Set(s)
      if (n.has(group)) n.delete(group); else n.add(group)
      return n
    })
  }

  async function logout() {
    await createClient().auth.signOut()
    router.push('/auth/login'); router.refresh()
  }

  function isActive(href: string): boolean {
    return pathname === href || (href !== '/dashboard' && href !== '/' && pathname.startsWith(href))
  }

  function ItemRow({ item }: { item: Item }) {
    const active = isActive(item.href)
    const Icon = item.icon
    const badge = item.badgeKey ? counts[item.badgeKey] : 0
    return (
      <Link href={item.href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all ${
          active ? 'text-[var(--accent-light)] font-medium' : 'hover:text-[var(--text-secondary)]'
        }`}
        style={active
          ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }
          : { color: 'var(--text-muted)', border: '1px solid transparent' }}>
        <Icon size={13} />
        <span className="flex-1">{item.label}</span>
        {badge > 0 && (
          <span className="text-[9px] font-mono px-1.5 rounded-full"
            style={{ background: 'rgba(248,113,113,0.18)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)' }}>
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside className="w-52 border-r border-[var(--border)] flex flex-col py-4 px-2 shrink-0"
      style={{ background: 'rgba(7,8,15,0.97)', backdropFilter: 'blur(20px)' }}>

      <div className="px-3 mb-3">
        <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: 'var(--accent-light)' }}>Super OS</p>
        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Multi-Agent Execution OS</p>
      </div>

      <Link href="/new-venture"
        className="mx-2 mb-4 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold"
        style={{ background: 'linear-gradient(90deg, #f472b6, #a78bfa)', color: '#fff' }}>
        ✨ 新 Venture
      </Link>

      <nav className="flex-1 overflow-auto">
        {/* Pinned core */}
        <div className="space-y-0.5 mb-3">
          {PINNED.map(item => <ItemRow key={item.href} item={item} />)}
        </div>

        {/* Collapsible groups */}
        <div className="space-y-1">
          {GROUPS.map(g => {
            const isOpen = openGroups.has(g.group)
            const hasActive = g.items.some(i => isActive(i.href))
            return (
              <div key={g.group}>
                <button onClick={() => toggle(g.group)}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest hover:text-[var(--text-secondary)] transition-colors"
                  style={{ color: hasActive ? 'var(--accent-light)' : 'var(--text-muted)', opacity: hasActive ? 1 : 0.6 }}>
                  {isOpen ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                  <span>{g.group}</span>
                  {!isOpen && hasActive && (
                    <span className="ml-auto text-[8px] font-mono"
                      style={{ color: 'var(--accent-light)' }}>·</span>
                  )}
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mb-2">
                    {g.items.map(item => <ItemRow key={item.href} item={item} />)}
                  </div>
                )}
              </div>
            )
          })}

          {isAdmin && (
            <div>
              <p className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Admin</p>
              <ItemRow item={{ href: '/admin/runs', label: 'All Runs', icon: Eye }} />
            </div>
          )}
        </div>
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
