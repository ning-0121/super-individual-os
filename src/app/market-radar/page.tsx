'use client'
import Sidebar from '@/components/layout/Sidebar'
import { Compass } from 'lucide-react'
import Link from 'next/link'

export default function MarketRadarPage() {
  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="glass rounded-xl p-8 max-w-md text-center">
          <Compass size={32} className="mx-auto mb-3 text-cyan-400" />
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Market Radar</h2>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
            汇总每个 System 的市场目标、竞品扫描、当前指标。Phase 2C 完整实现，
            当前可用 <Link href="/growth" className="text-[var(--accent-light)]">Growth Experiments</Link> 跟踪具体实验。
          </p>
        </div>
      </main>
    </div>
  )
}
