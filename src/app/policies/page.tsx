'use client'
import { useEffect, useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Loader2, ListChecks, ShieldCheck, ShieldAlert, X, Bot } from 'lucide-react'

interface Policy {
  id: string; policy_name: string; policy_type: string; priority: number;
  rule: { reason?: string; ai_manager_role?: string; ai_manager_roles_required?: string[]; require_qa?: boolean; require_ceo?: boolean }
  is_active: boolean
}

const TYPE_META: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  auto_approve:   { label: '自动放行',  color: 'text-emerald-400', icon: ShieldCheck },
  ai_manager:     { label: 'AI 经理决策', color: 'text-violet-400',  icon: Bot },
  human_required: { label: '人工审批',  color: 'text-amber-400',   icon: ShieldAlert },
  block:          { label: '阻断',      color: 'text-red-400',     icon: X },
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/policies').then(r => r.json()).then(d => {
      setPolicies(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="border-b border-[var(--border)] px-8 py-4 glass shrink-0">
          <p className="text-xs font-mono text-violet-400 tracking-widest uppercase mb-0.5">Organization</p>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Execution Policies</h1>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            按 priority 倒序匹配，第一个命中决定动作。L4 永远走 CEO。
          </p>
        </div>
        <div className="flex-1 overflow-auto p-6 max-w-4xl">
          {loading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--accent-light)]" /></div>}
          <div className="space-y-2">
            {policies.map(p => {
              const meta = TYPE_META[p.policy_type] ?? TYPE_META.human_required
              const Icon = meta.icon
              const requiredRoles = p.rule.ai_manager_roles_required ?? (p.rule.ai_manager_role ? [p.rule.ai_manager_role] : [])
              return (
                <div key={p.id} className="glass rounded-xl p-3 flex items-center gap-3">
                  <div className="flex items-center gap-1 shrink-0 w-12">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>P{p.priority}</span>
                  </div>
                  <Icon size={12} className={`${meta.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{p.policy_name}</code>
                      <span className={`text-[9px] ${meta.color}`}>{meta.label}</span>
                      {requiredRoles.length > 0 && (
                        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          → {requiredRoles.join(' + ')}
                        </span>
                      )}
                      {p.rule.require_ceo && <span className="text-[9px] text-red-400">CEO required</span>}
                      {p.rule.require_qa && <span className="text-[9px] text-cyan-400">QA required</span>}
                    </div>
                    {p.rule.reason && (
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.rule.reason}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="glass rounded-xl p-4 mt-6">
            <div className="flex items-center gap-2 mb-2 text-cyan-400">
              <ListChecks size={12} />
              <p className="text-xs font-semibold uppercase tracking-wider">总览</p>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              共 {policies.length} 条策略 · 自定义策略可通过 <code className="text-[var(--accent-light)]">POST /api/policies</code> 添加
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
