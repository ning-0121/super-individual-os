'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, MessageSquare, FolderOpen, CheckSquare, Brain, Users, LogOut } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Command',      icon: LayoutDashboard },
  { href: '/chat',      label: 'AI Co-founder', icon: MessageSquare },
  { href: '/projects',  label: 'Portfolio',    icon: FolderOpen },
  { href: '/tasks',     label: 'Execution',    icon: CheckSquare },
  { href: '/team',      label: 'Team',         icon: Users },
  { href: '/settings',  label: 'Second Brain', icon: Brain },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function logout() {
    await createClient().auth.signOut()
    router.push('/auth/login'); router.refresh()
  }

  return (
    <aside className="w-48 border-r border-[var(--border)] flex flex-col py-5 px-2 shrink-0"
      style={{ background: 'rgba(7,8,15,0.95)', backdropFilter: 'blur(20px)' }}>
      <div className="px-3 mb-6">
        <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: 'var(--accent-light)' }}>Super OS</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Founder Command Center</p>
      </div>

      <nav className="flex-1 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all ${
                active
                  ? 'text-[var(--accent-light)] font-medium'
                  : 'hover:text-[var(--text-secondary)]'
              }`}
              style={active
                ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', color: undefined }
                : { color: 'var(--text-muted)', border: '1px solid transparent' }}>
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </nav>

      <button onClick={logout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-colors mt-2"
        style={{ color: 'var(--text-muted)', border: '1px solid transparent' }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)' }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-muted)' }}>
        <LogOut size={14} /> 退出
      </button>
    </aside>
  )
}
