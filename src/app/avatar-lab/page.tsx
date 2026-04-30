'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { Sparkles } from 'lucide-react'

/**
 * V1.8 — Auralie 不再是全局入口。
 * 此页面保留为重定向占位，引导用户到 /projects（选项目）。
 * 真正的 Avatar 在 /projects/[id]/modules/avatar
 */
export default function AvatarLabRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    const t = setTimeout(() => router.replace('/projects'), 2000)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md text-center" style={{ border: '1px solid rgba(244,114,182,0.25)' }}>
          <Sparkles size={32} className="mx-auto mb-3 text-pink-400" />
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Auralie 已升级为项目模块</h2>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
            玩偶现在每个项目独立保存状态。请进入项目 → Modules → Auralie。
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>2 秒后自动跳转到 Projects...</p>
        </div>
      </main>
    </div>
  )
}
