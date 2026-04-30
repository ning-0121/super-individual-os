'use client'
import Link from 'next/link'
import { use } from 'react'
import { Sparkles, Brain } from 'lucide-react'

const MODULES = [
  {
    key: 'avatar',
    name: 'Auralie',
    description: '3D 玩偶伴侣 — 项目情绪可视化',
    status: 'active',
    icon: Sparkles,
    color: 'text-pink-400',
  },
  {
    key: 'second_brain',
    name: 'Second Brain',
    description: '项目级长期记忆库（V2 接入）',
    status: 'coming_soon',
    icon: Brain,
    color: 'text-violet-400',
  },
]

export default function ProjectModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div className="p-6 max-w-4xl">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
        项目模块
      </p>
      <div className="grid grid-cols-2 gap-3">
        {MODULES.map(m => {
          const Icon = m.icon
          const enabled = m.status === 'active'
          const Container = enabled
            ? ({ children }: { children: React.ReactNode }) => <Link href={`/projects/${id}/modules/${m.key}`}>{children}</Link>
            : ({ children }: { children: React.ReactNode }) => <div>{children}</div>
          return (
            <Container key={m.key}>
              <div className={`glass ${enabled ? 'glass-hover cursor-pointer' : 'opacity-50'} rounded-xl p-5 transition-all`}>
                <div className={`flex items-center gap-2 mb-2 ${m.color}`}>
                  <Icon size={14} />
                  <span className="text-sm font-semibold">{m.name}</span>
                  {!enabled && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded text-amber-400"
                      style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
                      即将支持
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{m.description}</p>
              </div>
            </Container>
          )
        })}
      </div>
    </div>
  )
}
