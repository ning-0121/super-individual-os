'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquare, CheckSquare, Activity, Package, Target, AlertTriangle, CheckCircle2, Milestone, ArrowRight } from 'lucide-react'
import ProjectOperatingDashboard from '@/components/project-context/ProjectOperatingDashboard'

interface ReportData {
  project: { id: string; name: string; goal_statement: string; description: string; status: string; plan_generated: boolean; current_stage?: number }
  stats: {
    total_tasks: number; completed: number; in_progress: number;
    blocked: number; revision_required: number;
    total_runs: number; successful_runs: number; failed_runs: number;
    total_artifacts: number; completion_pct: number;
  }
  blocked_items: Array<{ id: string; title: string; workflow_status: string }>
  generated_at: string
}

interface StageInfo {
  current_stage: number
  total_stages: number
  stages: Array<{ id: number; name_zh: string; short: string; goal: string }>
  gate: { can_advance: boolean; blockers: string[]; warnings: string[] }
}

export default function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ReportData | null>(null)
  const [stage, setStage] = useState<StageInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/report`).then(r => r.ok ? r.json() : null),
      fetch(`/api/projects/${id}/stage`).then(r => r.ok ? r.json() : null),
    ]).then(([rep, stg]) => {
      setData(rep)
      setStage(stg)
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loader />
  if (!data) return <p className="text-center py-12 text-[var(--text-muted)] text-sm">无法加载项目数据</p>

  const { stats } = data

  const currentStageDef = stage?.stages.find(s => s.id === stage.current_stage)

  return (
    <div className="p-6 max-w-5xl">

      {/* V2.5+ Project Operating Dashboard */}
      <ProjectOperatingDashboard projectId={id} />

      {/* Stage Hero (V1.9) */}
      {stage && currentStageDef && (
        <Link href={`/projects/${id}/stage`} className="block glass glass-hover rounded-xl p-5 mb-4 transition-all"
          style={{ border: '1px solid rgba(244,114,182,0.25)' }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-base font-mono font-bold shrink-0"
              style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6', border: '2px solid rgba(244,114,182,0.4)' }}>
              {stage.current_stage}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Milestone size={11} className="text-pink-400" />
                <p className="text-[10px] uppercase tracking-widest text-pink-400">
                  Stage {stage.current_stage} / {stage.total_stages}
                </p>
              </div>
              <h2 className="text-base font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{currentStageDef.name_zh}</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{currentStageDef.short} · {currentStageDef.goal}</p>
              <div className="mt-2 h-1 bg-[var(--bg-base)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${(stage.current_stage / stage.total_stages) * 100}%`, background: 'linear-gradient(90deg, #f472b6, #6366f1)' }} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {stage.gate.can_advance ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <CheckCircle2 size={10} /> 可推进
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle size={10} /> 闸门未通过
                </span>
              )}
              <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        </Link>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <QuickLink href={`/projects/${id}/chat`} icon={<MessageSquare size={13} />} label="Project Chat" sub="与 Linda 对话" color="text-violet-400" />
        <QuickLink href={`/projects/${id}/tasks`} icon={<CheckSquare size={13} />} label="任务"  sub={`${stats.total_tasks} 个`} color="text-cyan-400" />
        <QuickLink href={`/projects/${id}/runs`} icon={<Activity size={13} />} label="执行"  sub={`${stats.successful_runs} 成功`} color="text-emerald-400" />
        <QuickLink href={`/projects/${id}/artifacts`} icon={<Package size={13} />} label="产出物" sub={`${stats.total_artifacts} 个`} color="text-amber-400" />
      </div>

      {/* Stats grid */}
      <div className="glass rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3 text-[var(--accent-light)]">
          <Target size={13} />
          <span className="text-xs font-semibold uppercase tracking-wider">项目进度</span>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-3">
          <Stat label="总任务" value={stats.total_tasks} />
          <Stat label="完成"   value={stats.completed} accent="text-emerald-400" />
          <Stat label="进行中" value={stats.in_progress} accent="text-amber-400" />
          <Stat label="阻塞"   value={stats.blocked + stats.revision_required} accent="text-red-400" />
          <Stat label="完成率" value={`${stats.completion_pct}%`} accent="text-emerald-400" />
        </div>
        <div className="h-2 bg-[var(--bg-base)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${stats.completion_pct}%`, background: 'linear-gradient(90deg, #6366f1, #34d399)' }} />
        </div>
      </div>

      {/* Blocked items */}
      {data.blocked_items.length > 0 && (
        <div className="glass rounded-xl p-5 mb-4" style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
          <div className="flex items-center gap-2 mb-3 text-red-400">
            <AlertTriangle size={13} />
            <span className="text-xs font-semibold uppercase tracking-wider">需关注 ({data.blocked_items.length})</span>
          </div>
          <div className="space-y-1.5">
            {data.blocked_items.slice(0, 5).map(t => (
              <div key={t.id} className="text-xs flex items-center gap-2 p-2 rounded"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                <span className="text-red-400">●</span>
                <span style={{ color: 'var(--text-secondary)' }}>{t.title}</span>
                <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.workflow_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goal */}
      {data.project.goal_statement && (
        <div className="glass rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-2 text-emerald-400">
            <CheckCircle2 size={13} />
            <span className="text-xs font-semibold uppercase tracking-wider">项目目标</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{data.project.goal_statement}</p>
        </div>
      )}

      {/* Plan status */}
      <div className="glass rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--text-muted)]">下一步</p>
        {!data.project.plan_generated ? (
          <Link href={`/command-center`} className="text-sm text-[var(--accent-light)] hover:text-white transition-colors">
            → 前往 Command Center 生成执行计划
          </Link>
        ) : (
          <Link href={`/projects/${id}/report`} className="text-sm text-[var(--accent-light)] hover:text-white transition-colors">
            → 查看完整项目报告
          </Link>
        )}
      </div>
    </div>
  )
}

function QuickLink({ href, icon, label, sub, color }: { href: string; icon: React.ReactNode; label: string; sub: string; color: string }) {
  return (
    <Link href={href} className="glass glass-hover rounded-xl p-4 transition-all">
      <div className={`flex items-center gap-2 mb-1 ${color}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </Link>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-2xl font-mono ${accent ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function Loader() {
  return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>
}
