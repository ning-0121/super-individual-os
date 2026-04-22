'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/chat',      label: 'AI 对话',   icon: '◎' },
  { href: '/projects',  label: '项目',       icon: '◈' },
  { href: '/tasks',     label: '执行看板',   icon: '◻' },
  { href: '/settings',  label: '设置',       icon: '◉' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await createClient().auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 shrink-0">
      <div className="mb-8 px-3">
        <h1 className="text-sm font-semibold text-gray-200 tracking-wide">超级个体 OS</h1>
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {nav.map(({ href, label, icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
              ${pathname.startsWith(href)
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'}`}>
            <span className="text-base">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
      <button onClick={logout}
        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 transition-colors mt-2">
        <span>⎋</span> 退出登录
      </button>
    </aside>
  )
}
