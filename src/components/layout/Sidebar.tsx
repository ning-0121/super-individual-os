'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/chat', label: 'AI 对话', icon: '◎' },
  { href: '/projects', label: '项目', icon: '◈' },
  { href: '/tasks', label: '执行看板', icon: '◻' },
  { href: '/settings', label: '设置', icon: '◉' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 shrink-0">
      <div className="mb-8 px-3">
        <h1 className="text-sm font-semibold text-gray-200 tracking-wide">超级个体 OS</h1>
      </div>
      <nav className="flex flex-col gap-1">
        {nav.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
              ${pathname.startsWith(href)
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'}`}
          >
            <span className="text-base">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
