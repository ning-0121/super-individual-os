'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { Compass, Loader2, Network, Plus, TrendingUp } from 'lucide-react'

interface SystemRow {
  id: string; name: string; description: string; status: string
  metadata?: Record<string, unknown>
}

export default function MarketRadarPage() {
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/systems').then(r => r.ok ? r.json() : { systems: [] })
      .then(d => setSystems(d.systems ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-cyan-400 tracking-widest uppercase mb-0.5">Market Layer</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Market Radar</h1>
        </div>

        <div className="flex-1 overflow-auto p-6 max-w-4xl">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-[var(--accent-light)]" />
            </div>
          )}

          {!loading && systems.length === 0 && (
            <div className="text-center py-16">
              <Compass size={28} className="mx-auto mb-3 text-cyan-400" />
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>还没有 System</p>
              <p className="text-[11px] mt-2 mb-4" style={{ color: 'var(--text-muted)' }}>
                Market Radar 按 System 维度跟踪市场目标 / 竞品 / 当前指标。先创建一个 System 再回来。
              </p>
              <Link href="/systems"
                className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg"
                style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}>
                <Plus size={12} /> Create your first system
              </Link>
            </div>
          )}

          {!loading && systems.length > 0 && (
            <>
              <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                每个 System 的市场目标 / 竞品扫描占位。完整竞品爬取由 Phase 2C agent 实现，
                现在先用 <Link href="/growth" className="text-[var(--accent-light)]">Growth Experiments</Link> 跟踪具体动作。
              </p>
              <div className="grid grid-cols-2 gap-3">
                {systems.map(s => {
                  const meta = (s.metadata ?? {}) as Record<string, string>
                  return (
                    <Link key={s.id} href={`/systems/${s.id}`}
                      className="block glass rounded-xl p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <Network size={13} className="text-cyan-400" />
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                      </div>
                      {meta.business_goal && (
                        <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                          🎯 {meta.business_goal}
                        </p>
                      )}
                      <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                        <p>• 目标客户：(待定义)</p>
                        <p>• 竞品扫描：(尚未运行)</p>
                        <p>• 当前指标：见 Growth Experiments</p>
                      </div>
                      <div className="mt-3 pt-3 flex items-center gap-2 text-[10px]"
                        style={{ borderTop: '1px solid var(--border)' }}>
                        <Link href="/growth"
                          className="inline-flex items-center gap-1 text-pink-400 hover:underline"
                          onClick={e => e.stopPropagation()}>
                          <TrendingUp size={9} /> Growth
                        </Link>
                        <span className="ml-auto text-[var(--accent-light)]">→ System</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
