'use client'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Sparkles, ArrowRight, Network, FolderOpen, CheckSquare, ShieldAlert,
  TrendingUp, Bot, ExternalLink, X,
} from 'lucide-react'
import { QUICK_ACTIONS, type CopilotIntent } from '@/lib/ai/copilot-intent'

interface CopilotResponse {
  intent: CopilotIntent
  payload: Record<string, unknown>
}

interface Props {
  // When falling through to "chat", pass the query to the parent so it can stream
  // through the existing /api/ai/strategy pipeline.
  onChat?: (query: string) => void
  // Compact mode shrinks padding for header use
  compact?: boolean
}

export default function CommandBar({ onChat, compact }: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resp, setResp] = useState<CopilotResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K to focus
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function run(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setLoading(true)
    setResp(null)
    const r = await fetch('/api/ai/copilot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: q }),
    })
    if (!r.ok) { setLoading(false); return }
    const data = await r.json() as CopilotResponse
    setLoading(false)

    // For nav intent, jump immediately
    if (data.intent.kind === 'nav') {
      router.push(data.intent.route)
      setInput('')
      return
    }
    // For start_venture, jump with seed
    if (data.intent.kind === 'start_venture') {
      router.push(`/new-venture?seed=${encodeURIComponent(data.intent.seed)}`)
      setInput('')
      return
    }
    // For chat, hand off
    if (data.intent.kind === 'chat' && onChat) {
      onChat(data.intent.query)
      setInput('')
      return
    }
    setResp(data)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run() }
    if (e.key === 'Escape') { setInput(''); setResp(null); inputRef.current?.blur() }
  }

  return (
    <div className={compact ? '' : 'mb-4'}>
      {/* Input */}
      <div className="relative flex items-center gap-2"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 12 }}>
        <Sparkles size={14} className="ml-3 text-[var(--accent-light)]" />
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="跟 AI 联合创始人说一句话…  例：'今天做什么' / '看待审批' / '我想做一个内容工厂'"
          className="flex-1 bg-transparent text-sm py-3 focus:outline-none"
          style={{ color: 'var(--text-primary)' }} />
        <kbd className="text-[10px] mr-3 px-1.5 py-0.5 rounded font-mono"
          style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>⌘K</kbd>
        {loading && <Loader2 size={14} className="mr-3 animate-spin text-[var(--accent-light)]" />}
      </div>

      {/* Quick actions when idle */}
      {!resp && !loading && !input && !compact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} onClick={() => run(a.sample)}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <span className="mr-1">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}

      {/* Response card */}
      {resp && (
        <div className="mt-3 glass rounded-xl p-4 relative">
          <button onClick={() => { setResp(null); setInput('') }}
            className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <X size={12} />
          </button>
          <ResponseCard resp={resp} />
        </div>
      )}
    </div>
  )
}

function ResponseCard({ resp }: { resp: CopilotResponse }) {
  const { intent, payload } = resp

  if (intent.kind === 'help') {
    return (
      <div>
        <p className="text-xs font-semibold mb-2 text-[var(--accent-light)]">Copilot 命令参考</p>
        <ul className="text-[11px] space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <li>· "今天做什么" / "待办" → 列出未完成任务</li>
          <li>· "看待审批" → 列出待审批 + 跳转</li>
          <li>· "我的系统" / "系统列表" → 列出所有 System</li>
          <li>· "我的项目" → 列出活跃项目</li>
          <li>· "看下增长实验" → 列出实验</li>
          <li>· "CTO 汇报一下" / "让所有经理汇报" → Manager Report（无则即时生成）</li>
          <li>· "今天谁有问题" / "哪个项目卡住了" → 阻塞总览</li>
          <li>· "想做一个 X" → 跳到 ✨ 新 Venture (带预填)</li>
          <li>· 其他自然语言 → AI 联合创始人对话</li>
        </ul>
      </div>
    )
  }

  if (intent.kind === 'list_systems') {
    const systems = (payload.systems as Array<{ id: string; name: string; status: string; project_count: number; business_goal: string }>) ?? []
    return (
      <SectionList icon={Network} title="Systems" count={systems.length} accent="text-cyan-400"
        empty="还没有 System — 用 ✨ 新 Venture 起步"
        emptyAction={{ label: '新建 Venture', href: '/new-venture' }}>
        {systems.map(s => (
          <Link key={s.id} href={`/systems/${s.id}`} className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {s.project_count} 项目</span>
            {s.business_goal && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· 🎯 {s.business_goal}</span>}
            <ArrowRight size={10} className="ml-auto text-[var(--text-muted)]" />
          </Link>
        ))}
      </SectionList>
    )
  }

  if (intent.kind === 'list_projects') {
    const projects = (payload.projects as Array<{ id: string; name: string; status: string; current_stage: number; north_star_metric: string; north_star_target: string }>) ?? []
    return (
      <SectionList icon={FolderOpen} title="Projects" count={projects.length} accent="text-cyan-400"
        empty="还没有项目"
        emptyAction={{ label: '前往 Projects', href: '/projects' }}>
        {projects.map(p => (
          <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>stage {p.current_stage}</span>
            {p.north_star_metric && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {p.north_star_metric} → {p.north_star_target}</span>}
            <ArrowRight size={10} className="ml-auto text-[var(--text-muted)]" />
          </Link>
        ))}
      </SectionList>
    )
  }

  if (intent.kind === 'list_tasks') {
    const tasks = (payload.tasks as Array<{ id: string; title: string; project_id: string; workflow_status: string; priority: string }>) ?? []
    return (
      <SectionList icon={CheckSquare} title="未完成任务" count={tasks.length} accent="text-emerald-400"
        empty="🎉 没有待办" emptyAction={{ label: '前往任务面板', href: '/tasks' }}>
        {tasks.map(t => (
          <Link key={t.id} href={`/projects/${t.project_id}/tasks`} className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
            <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.priority} · {t.workflow_status}</span>
          </Link>
        ))}
      </SectionList>
    )
  }

  if (intent.kind === 'list_approvals') {
    const approvals = (payload.approvals as Array<{ id: string; action_type: string; risk_level: number; classification_reason: string; required_approvers: string[] }>) ?? []
    return (
      <SectionList icon={ShieldAlert} title="待审批" count={approvals.length} accent="text-amber-400"
        empty="✅ 没有待审批" emptyAction={{ label: '审批中心', href: '/approvals' }}>
        {approvals.slice(0, 6).map(a => (
          <Link key={a.id} href="/approvals" className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <code className="text-[10px] font-mono px-1 rounded text-amber-400" style={{ background: 'rgba(251,191,36,0.1)' }}>L{a.risk_level}</code>
            <span style={{ color: 'var(--text-primary)' }}>{a.action_type}</span>
            <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{a.classification_reason}</span>
          </Link>
        ))}
        {approvals.length > 0 && (
          <Link href="/approvals" className="text-[10px] text-[var(--accent-light)] inline-flex items-center gap-1">
            前往审批中心 <ExternalLink size={9} />
          </Link>
        )}
      </SectionList>
    )
  }

  if (intent.kind === 'list_growth') {
    const exps = (payload.experiments as Array<{ id: string; name: string; status: string; channel: string; target_metric: string }>) ?? []
    return (
      <SectionList icon={TrendingUp} title="增长实验" count={exps.length} accent="text-pink-400"
        empty="还没有增长实验" emptyAction={{ label: '前往 Growth', href: '/growth' }}>
        {exps.map(e => (
          <Link key={e.id} href="/growth" className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>{e.name}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {e.channel || '?'}</span>
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{e.status}</span>
          </Link>
        ))}
      </SectionList>
    )
  }

  if (intent.kind === 'manager_report') {
    const reports = (payload.reports as Array<{ id: string; role: string; title: string; summary: string; source: string; generated_at: string; needs_user_intervention: boolean; blockers: string[]; risks: string[]; next_actions: string[]; confidence_score: number }>) ?? []
    const requested = (payload.requested_role as string | null) ?? null
    const justGenerated = (payload.just_generated as boolean) ?? false
    return (
      <>
        {justGenerated && (
          <p className="text-[10px] mb-2 text-emerald-400">✨ 已为你即时生成最新报告</p>
        )}
        <SectionList icon={Bot} title={requested ? `${requested} 报告` : '经理报告'} count={reports.length} accent="text-violet-400"
          empty="还没有经理报告"
          emptyAction={{ label: '前往 Mission Control 让经理汇报', href: '/mission-control' }}>
          {reports.slice(0, 4).map(r => (
            <div key={r.id} className="text-[11px] p-2 rounded-lg"
              style={{
                background: 'var(--bg-base)',
                border: r.needs_user_intervention ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--border)',
              }}>
              <div className="flex items-center gap-2 mb-1">
                <code className="text-[9px] font-mono text-violet-400 px-1 rounded"
                  style={{ background: 'rgba(167,139,250,0.1)' }}>{r.role}</code>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  conf {Math.round((r.confidence_score ?? 0) * 100)}% · {new Date(r.generated_at).toLocaleTimeString('zh-CN')}
                </span>
                {r.needs_user_intervention && (
                  <span className="ml-auto text-[9px] text-red-400">需介入</span>
                )}
              </div>
              <p style={{ color: 'var(--text-primary)' }}>{r.summary || '(空)'}</p>
              {(r.blockers?.length > 0) && (
                <p className="text-[10px] mt-1 text-amber-400">阻塞: {r.blockers.slice(0, 2).join('; ')}</p>
              )}
              {(r.next_actions?.length > 0) && (
                <p className="text-[10px] mt-1 text-cyan-400">下一步: {r.next_actions[0]}</p>
              )}
            </div>
          ))}
        </SectionList>
      </>
    )
  }

  if (intent.kind === 'blockers_overview') {
    const blocked = (payload.blocked_reports as Array<{ id: string; role: string; summary: string; blockers: string[]; needs_user_intervention: boolean }>) ?? []
    const stuck = (payload.stuck_tasks as Array<{ id: string; title: string; project_id: string; updated_at: string }>) ?? []
    return (
      <>
        <SectionList icon={ShieldAlert} title="经理报告中的阻塞" count={blocked.length} accent="text-amber-400"
          empty="🎉 经理报告里没有阻塞" emptyAction={{ label: 'Mission Control', href: '/mission-control' }}>
          {blocked.map(r => (
            <div key={r.id} className="text-[11px] p-2 rounded-lg"
              style={{ background: 'var(--bg-base)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <code className="text-[9px] font-mono px-1 rounded text-violet-400"
                  style={{ background: 'rgba(167,139,250,0.1)' }}>{r.role}</code>
                <span style={{ color: 'var(--text-primary)' }}>{r.blockers[0] ?? r.summary}</span>
              </div>
            </div>
          ))}
        </SectionList>
        {stuck.length > 0 && (
          <div className="mt-3">
            <SectionList icon={CheckSquare} title="48h 没动的任务" count={stuck.length} accent="text-orange-400"
              empty="" emptyAction={{ label: '', href: '#' }}>
              {stuck.map(t => (
                <Link key={t.id} href={`/projects/${t.project_id}/tasks`}
                  className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(t.updated_at).toLocaleDateString('zh-CN')}
                  </span>
                </Link>
              ))}
            </SectionList>
          </div>
        )}
      </>
    )
  }

  return null
}

function SectionList({ icon: Icon, title, count, accent, empty, emptyAction, children }: {
  icon: typeof Network; title: string; count: number; accent: string;
  empty: string; emptyAction?: { label: string; href: string };
  children: React.ReactNode
}) {
  return (
    <>
      <div className={`flex items-center gap-2 mb-2 ${accent}`}>
        <Icon size={12} />
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{count}</span>
      </div>
      {count === 0 ? (
        <div className="py-3 text-center">
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{empty}</p>
          {emptyAction && (
            <Link href={emptyAction.href} className="text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
              {emptyAction.label} <ArrowRight size={9} />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </>
  )
}
