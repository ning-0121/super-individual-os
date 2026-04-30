'use client'
import { useEffect, useState, useRef, use } from 'react'
import dynamic from 'next/dynamic'
import { AvatarDebugPanel } from '@/components/avatar/AvatarDebugPanel'
import { DEFAULT_AVATAR_STATE, type AvatarState } from '@/lib/avatar/types'
import { ACTION_DURATION_MS } from '@/lib/avatar/state-machine'
import { Sparkles, Save, Loader2 } from 'lucide-react'

const AvatarCanvas = dynamic(
  () => import('@/components/avatar/AvatarCanvas').then(m => m.AvatarCanvas),
  { ssr: false, loading: () => <CanvasLoading /> }
)

export default function ProjectAvatarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [state, setState]   = useState<AvatarState>(DEFAULT_AVATAR_STATE)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load persisted state
  useEffect(() => {
    fetch(`/api/projects/${projectId}/avatar`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { mood: string; expression: string; action: string; outfit: string; growth_stage: string } | null) => {
        if (d) setState(d as AvatarState)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [projectId])

  // Auto-return one-shot actions
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

  async function persist() {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/avatar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    setSavedAt(new Date().toLocaleTimeString('zh-CN'))
    setSaving(false)
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Stage area */}
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 flex items-center justify-between glass border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-pink-400" />
            <span className="text-xs font-mono text-pink-400 uppercase tracking-widest">Project Avatar</span>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>已保存 {savedAt}</span>}
            <button onClick={persist} disabled={saving || !loaded}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.3)' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存到本项目
            </button>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center top, rgba(167,139,250,0.10) 0%, transparent 60%), radial-gradient(ellipse at center bottom, rgba(244,114,182,0.08) 0%, transparent 60%)',
          }} />

        {loaded ? <AvatarCanvas state={state} /> : <CanvasLoading />}

        <div className="absolute bottom-4 left-4 glass rounded-lg px-3 py-2 text-[10px] font-mono"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <span className="text-[var(--accent-light)]">{state.action}</span>
          {' · '}
          <span className="text-emerald-400">{state.expression}</span>
          {' · '}
          <span className="text-amber-400">{state.mood}</span>
        </div>
      </div>

      <AvatarDebugPanel state={state} onChange={setState} />
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
