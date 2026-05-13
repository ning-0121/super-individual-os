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
          <li>· "批准所有低风险事项" / "拒绝所有高风险" → 批量治理</li>
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

  if (intent.kind === 'cost_summary') {
    interface Sum { calls: number; cost_usd: number; fallback_count: number; failure_count: number }
    interface Top { provider: string; model: string; estimated_cost: number; calls: number }
    interface ByStage { stage: string; cost_usd: number; calls: number; failure_rate: number }
    const summary = payload.summary as { today: Sum; week: Sum; month: Sum }
    const top = payload.top_model as Top | null
    const byStage = (payload.by_stage as ByStage[]) ?? []
    const guard = payload.guardrails as { overall_level: 'ok'|'warning'|'critical'; banner_message?: string }
    const fmt = (u: number) => u === 0 ? '$0' : (u < 1 ? `$${u.toFixed(4)}` : `$${u.toFixed(2)}`)
    const aspect = intent.aspect ?? 'general'
    const window = intent.window ?? 'month'
    const focusedSum = window === 'today' ? summary.today : window === 'week' ? summary.week : summary.month

    return (
      <>
        <div className="flex items-center gap-2 mb-2 text-violet-400">
          <Sparkles size={12} />
          <p className="text-xs font-semibold uppercase tracking-wider">AI 成本</p>
          <Link href="/cost" className="ml-auto text-[10px] inline-flex items-center gap-1 text-[var(--accent-light)]">
            打开 Cost <ExternalLink size={9} />
          </Link>
        </div>

        {guard.banner_message && (
          <div className="rounded-lg p-2 mb-2 text-[10px]"
            style={{
              background: guard.overall_level === 'critical' ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
              color: guard.overall_level === 'critical' ? '#f87171' : '#fbbf24',
              border: `1px solid ${guard.overall_level === 'critical' ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'}`,
            }}>
            ⚠ {guard.banner_message}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-2 text-[11px]">
          <Cell label="今日" value={fmt(summary.today.cost_usd)} sub={`${summary.today.calls} 次`} />
          <Cell label="本周" value={fmt(summary.week.cost_usd)}  sub={`${summary.week.calls} 次`} />
          <Cell label="本月" value={fmt(summary.month.cost_usd)} sub={`${summary.month.calls} 次`}
            accent={guard.overall_level === 'critical' ? 'text-red-400' : guard.overall_level === 'warning' ? 'text-amber-400' : 'text-violet-400'} />
        </div>

        {(aspect === 'most_expensive' || aspect === 'general') && top && (
          <div className="text-[11px] p-2 rounded-lg mb-2"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
              本月最贵
            </p>
            <p style={{ color: 'var(--text-primary)' }}>
              {top.provider} · <span className="font-mono">{top.model}</span>
              <span className="ml-2 text-violet-400 font-mono">{fmt(top.estimated_cost)}</span>
              <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>({top.calls} 次)</span>
            </p>
          </div>
        )}

        {(aspect === 'fallback' || aspect === 'general') && focusedSum && (
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
            {window === 'today' ? '今日' : window === 'week' ? '本周' : '本月'}
            fallback <span className="text-amber-400 font-mono">{focusedSum.fallback_count}</span> 次 ·
            错误 <span className="text-red-400 font-mono">{focusedSum.failure_count}</span> 次
          </p>
        )}

        {(aspect === 'by_stage' || aspect === 'general') && byStage.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              按 stage（本月 top 5）
            </p>
            <div className="space-y-1">
              {byStage.map(s => (
                <div key={s.stage} className="flex items-center gap-2 text-[11px] p-1.5 rounded"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <code className="font-mono text-[10px] px-1 rounded text-pink-400"
                    style={{ background: 'rgba(244,114,182,0.1)' }}>{s.stage}</code>
                  <span style={{ color: 'var(--text-muted)' }}>{s.calls} 次</span>
                  {s.failure_rate > 0 && (
                    <span className="text-red-400">{Math.round(s.failure_rate * 100)}% fail</span>
                  )}
                  <span className="ml-auto font-mono text-violet-400">{fmt(s.cost_usd)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  if (intent.kind === 'workflow_status') {
    interface WfRun {
      run_id: string; workflow_id: string; workflow_name: string
      project_id: string | null; project_name: string | null
      status: string; bottleneck_step_key: string | null
      completed: number; total: number; failed: number
    }
    const runs = (payload.runs as WfRun[]) ?? []
    const activeCount = (payload.active_count as number) ?? 0
    const blockedCount = (payload.blocked_count as number) ?? 0
    return (
      <>
        <div className="flex items-center gap-2 mb-2 text-cyan-400">
          <ShieldAlert size={12} />
          <p className="text-xs font-semibold uppercase tracking-wider">
            Workflow 状态 ({activeCount})
          </p>
          {blockedCount > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded text-amber-400"
              style={{ background: 'rgba(251,191,36,0.12)' }}>
              {blockedCount} blocked
            </span>
          )}
        </div>
        {runs.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            没有活跃 workflow — 去任意项目的 Workflows tab 启动一个
          </p>
        ) : (
          <div className="space-y-1">
            {runs.slice(0, 5).map(r => (
              <Link key={r.run_id}
                href={r.project_id ? `/projects/${r.project_id}/workflows/${r.workflow_id}` : '#'}
                className="flex items-center gap-2 text-[11px] p-2 rounded-lg hover:bg-white/5"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <code className="text-[9px] font-mono uppercase px-1 py-0.5 rounded"
                  style={{
                    background: r.status === 'blocked_approval' ? 'rgba(251,191,36,0.12)'
                      : r.status === 'failed' ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)',
                    color: r.status === 'blocked_approval' ? '#fbbf24'
                      : r.status === 'failed' ? '#f87171' : '#34d399',
                  }}>
                  {r.status}
                </code>
                <span style={{ color: 'var(--text-primary)' }}>{r.workflow_name}</span>
                {r.bottleneck_step_key && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    · bottleneck: <code className="font-mono">{r.bottleneck_step_key}</code>
                  </span>
                )}
                <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {r.completed}/{r.total}
                </span>
              </Link>
            ))}
          </div>
        )}
      </>
    )
  }

  if (intent.kind === 'local_agent_status') {
    interface LASession {
      id: string; hostname: string | null; os: string | null
      cursor_version: string | null
      derived_status: 'online' | 'offline' | 'error'
      last_heartbeat: string | null
    }
    interface Verdict { allowed: boolean; category: string; reason: string }
    interface LastResult { action: string; status: string; result: unknown; finished_at: string | null }
    const sessions = (payload.sessions as LASession[]) ?? []
    const online = (payload.online_count as number) ?? 0
    const probe = (payload.probe as string) ?? 'general'
    const verdict = (payload.verdict as Verdict | null) ?? null
    const lastResult = (payload.last_result as LastResult | null) ?? null
    const caps = (payload.capabilities as { allowed: string[]; blocked: string[] }) ?? { allowed: [], blocked: [] }

    return (
      <>
        <div className="flex items-center gap-2 mb-2 text-orange-400">
          <ShieldAlert size={12} />
          <p className="text-xs font-semibold uppercase tracking-wider">
            Local Agent · V0 只读
          </p>
          <span className="ml-auto text-[10px] inline-flex items-center gap-1"
            style={{ color: online > 0 ? '#34d399' : '#94a3b8' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: online > 0 ? '#34d399' : '#94a3b8' }} />
            {online} 在线
          </span>
        </div>

        {sessions.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            还没注册本地 Agent — 在 <Link href="/tools/autonomy" className="text-[var(--accent-light)]">/tools/autonomy</Link> 启动桌面端
          </p>
        ) : (
          <div className="space-y-1 mb-2">
            {sessions.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[11px] p-2 rounded-lg"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: s.derived_status === 'online' ? '#34d399'
                      : s.derived_status === 'error' ? '#f87171' : '#94a3b8',
                  }} />
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {s.hostname || s.id.slice(0, 8)}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {s.os ?? ''}
                </span>
                <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {s.derived_status}
                </span>
              </div>
            ))}
          </div>
        )}

        {verdict && probe !== 'general' && (
          <div className="text-[11px] p-2 rounded-lg mb-2"
            style={{
              background: verdict.allowed ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
              border: `1px solid ${verdict.allowed ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: verdict.allowed ? '#34d399' : '#f87171',
            }}>
            {verdict.allowed ? '✓ 允许' : '✗ 拒绝'}：<code className="font-mono">{probe}</code> — {verdict.reason}
          </div>
        )}

        {lastResult && (
          <div className="text-[10px] p-2 rounded-lg mb-2"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              最近一次 <code className="font-mono">{lastResult.action}</code> · {lastResult.status}
              {lastResult.finished_at && (
                <span> · {new Date(lastResult.finished_at).toLocaleString('zh-CN')}</span>
              )}
            </p>
            <LocalAgentResultBody result={lastResult.result} probe={probe} />
          </div>
        )}

        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          允许（{caps.allowed.length}）· V0 拒绝写 / shell / push / 部署（{caps.blocked.length}）
        </p>
        <Link href="/tools/autonomy" className="text-[10px] inline-flex items-center gap-1 mt-1 text-[var(--accent-light)]">
          打开 Local Agent 面板 <ExternalLink size={9} />
        </Link>
      </>
    )
  }

  if (intent.kind === 'bulk_approve' || intent.kind === 'bulk_reject') {
    const processed = (payload.processed as number) ?? 0
    const succeeded = (payload.succeeded as number) ?? 0
    const items = (payload.items as Array<{ id: string; ok: boolean; action_type: string }>) ?? []
    const isApprove = intent.kind === 'bulk_approve'
    return (
      <>
        <div className={`flex items-center gap-2 mb-2 ${isApprove ? 'text-emerald-400' : 'text-red-400'}`}>
          <ShieldAlert size={12} />
          <p className="text-xs font-semibold uppercase tracking-wider">
            {isApprove ? '已批准' : '已拒绝'} ({succeeded} / {processed})
          </p>
          <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>
            risk ≤ {intent.risk_label}
          </span>
        </div>
        {processed === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            没有符合条件的待审批项
          </p>
        ) : (
          <div className="space-y-1">
            {items.slice(0, 6).map(it => (
              <div key={it.id} className="text-[11px] p-2 rounded-lg"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <span className={it.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {it.ok ? '✓' : '✗'}
                </span>
                <code className="ml-2 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>{it.action_type}</code>
              </div>
            ))}
          </div>
        )}
        <Link href="/approvals" className="text-[10px] inline-flex items-center gap-1 mt-2 text-[var(--accent-light)]">
          打开审批中心 <ExternalLink size={9} />
        </Link>
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

function LocalAgentResultBody({ result, probe }: { result: unknown; probe: string }) {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>

  if (probe === 'git_status') {
    const branch_line = String(r.branch_line ?? '')
    const changes = Array.isArray(r.changes) ? (r.changes as string[]) : []
    return (
      <div className="mt-1.5 font-mono text-[10px] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}>
        {branch_line && <div className="text-cyan-400">{branch_line}</div>}
        {changes.length === 0 ? (
          <div className="text-emerald-400">✓ working tree clean</div>
        ) : changes.slice(0, 12).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {changes.length > 12 && (
          <div style={{ color: 'var(--text-muted)' }}>… +{changes.length - 12} more</div>
        )}
      </div>
    )
  }
  if (probe === 'git_branch') {
    return (
      <p className="mt-1 font-mono text-[11px] text-cyan-400">
        {String(r.branch ?? '(detached)')}
      </p>
    )
  }
  if (probe === 'npm_test_status' || probe === 'build_status') {
    return (
      <p className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
        script_present: <span className={r.script_present ? 'text-emerald-400' : 'text-red-400'}>
          {String(!!r.script_present)}
        </span>
        {r.command ? <span> · <code>{String(r.command)}</code></span> : null}
      </p>
    )
  }
  return null
}

function Cell({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-lg p-2"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`font-mono ${accent ?? ''}`}
        style={accent ? undefined : { color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
