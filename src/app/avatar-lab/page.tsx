'use client'
import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/layout/Sidebar'
import { AvatarDebugPanel } from '@/components/avatar/AvatarDebugPanel'
import { DEFAULT_AVATAR_STATE, type AvatarState } from '@/lib/avatar/types'
import { ACTION_DURATION_MS } from '@/lib/avatar/state-machine'
import { Sparkles } from 'lucide-react'

// R3F Canvas must be client-only — Three.js does not SSR
const AvatarCanvas = dynamic(
  () => import('@/components/avatar/AvatarCanvas').then(m => m.AvatarCanvas),
  { ssr: false, loading: () => <CanvasLoading /> }
)

export default function AvatarLabPage() {
  const [state, setState] = useState<AvatarState>(DEFAULT_AVATAR_STATE)
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-return one-shot actions to idle after their duration
  useEffect(() => {
    if (autoReturnTimer.current) clearTimeout(autoReturnTimer.current)
    const ms = ACTION_DURATION_MS[state.action]
    if (ms !== null) {
      autoReturnTimer.current = setTimeout(() => {
        setState(prev => prev.action === state.action ? { ...prev, action: 'idle' } : prev)
      }, ms)
    }
    return () => { if (autoReturnTimer.current) clearTimeout(autoReturnTimer.current) }
  }, [state.action])

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">

        {/* Stage area */}
        <div className="flex-1 relative">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 flex items-center justify-between glass border-b border-[var(--border)]">
            <div>
              <p className="text-xs font-mono text-pink-400 tracking-widest uppercase mb-0.5">Auralie · 3D Avatar Lab</p>
              <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>玩偶测试舞台</h1>
            </div>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1 text-emerald-400">
                <Sparkles size={10} /> V1 procedural
              </span>
              <span>·</span>
              <span>拖拽旋转 · 滚轮缩放</span>
            </div>
          </div>

          {/* Background gradient under canvas */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center top, rgba(167,139,250,0.10) 0%, transparent 60%), radial-gradient(ellipse at center bottom, rgba(244,114,182,0.08) 0%, transparent 60%)',
            }} />

          <AvatarCanvas state={state} />

          {/* State badge bottom-left */}
          <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-2 text-[10px] font-mono"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <span className="text-[var(--accent-light)]">{state.action}</span>
            {' · '}
            <span className="text-emerald-400">{state.expression}</span>
            {' · '}
            <span className="text-amber-400">{state.mood}</span>
          </div>
        </div>

        {/* Right debug panel */}
        <AvatarDebugPanel state={state} onChange={setState} />
      </main>
    </div>
  )
}

function CanvasLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-2 animate-pulse">✨</div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>加载 3D 引擎中...</p>
      </div>
    </div>
  )
}
