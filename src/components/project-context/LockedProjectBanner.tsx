'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield, ExternalLink } from 'lucide-react'

interface LockedProject {
  project_id: string
  project_name: string
  current_focus: string
  context_version: number
}

export default function LockedProjectBanner({ compact }: { compact?: boolean } = {}) {
  const [items, setItems] = useState<LockedProject[]>([])

  useEffect(() => {
    fetch('/api/projects/locked').then(r => r.ok ? r.json() : { locked: [] })
      .then(d => setItems(d.locked ?? []))
      .catch(() => {})
  }, [])

  if (items.length === 0) return null

  return (
    <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'} px-3 py-2 rounded-lg`}
      style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
      <Shield size={12} className="text-emerald-400" />
      <span className="text-[10px] uppercase tracking-wider text-emerald-400">Locked Project{items.length > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
        {items.map(it => (
          <Link key={it.project_id} href={`/projects/${it.project_id}`}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono whitespace-nowrap"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            {it.project_name}
            <span className="text-[9px] opacity-70">v{it.context_version}</span>
            <ExternalLink size={8} />
          </Link>
        ))}
      </div>
    </div>
  )
}
