'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Play, Lock, ExternalLink } from 'lucide-react'

interface Task {
  id: string; title: string; description: string;
  workflow_status: string; status: string;
  priority: string; task_type: string;
  assigned_unit_id: string | null; execution_unit_id: string | null;
  context_payload: { depends_on?: string[]; order?: number };
  acceptance_criteria: string;
}

interface Agent { id: string; name: string; avatar: string; agent_type: string; type: string }

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', planned: '已规划', assigned: '已分配', running: '执行中',
  blocked: '阻塞', submitted: '已提交', under_review: '审核中',
  revision_required: '需返工', approved: '已审批', completed: '已完成', archived: '已归档',
}
const STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8', planned: '#22d3ee', assigned: '#60a5fa', running: '#fbbf24',
  blocked: '#f87171', submitted: '#a78bfa', under_review: '#fb923c',
  revision_required: '#f87171', approved: '#34d399', completed: '#34d399', archived: '#64748b',
}

export default function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const router = useRouter()
  const [tasks, setTasks]   = useState<Task[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [approvalNotices, setApprovalNotices] = useState<Record<string, {
    approval_id: string; risk_level: number; required_approvers: string[]; classification_reason: string
  }>>({})

  useEffect(() => {
    Promise.all([
      fetch(`/api/tasks?projectId=${projectId}`).then(r => r.json()),
      fetch(`/api/agents`).then(r => r.json()),
    ]).then(([t, a]) => {
      setTasks(Array.isArray(t) ? t : [])
      setAgents(Array.isArray(a) ? a : [])
    }).finally(() => setLoading(false))
  }, [projectId])

  function isBlocked(t: Task) {
    const deps = (t.context_payload?.depends_on ?? []).filter((x): x is string => typeof x === 'string')
    if (deps.length === 0) return false
    return tasks.some(o => deps.includes(o.id) && !['completed','approved'].includes(o.workflow_status))
  }

  async function runAgent(taskId: string) {
    setRunning(taskId)
    const res = await fetch(`/api/tasks/${taskId}/run`, { method: 'POST' })
    const data = await res.json()
    setRunning(null)

    // V2.0 Phase 2A — high-risk action gated by manager approval
    if (data?.dispatch === 'pending_approval' && data.approval_id) {
      setApprovalNotices(prev => ({
        ...prev,
        [taskId]: {
          approval_id: data.approval_id as string,
          risk_level: data.risk_level as number,
          required_approvers: (data.required_approvers ?? []) as string[],
          classification_reason: (data.classification_reason ?? '') as string,
        },
      }))
      return
    }

    if (data.task_run_id) router.push(`/task-runs/${data.task_run_id}`)
    else if (data.error) alert(data.error)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--accent-light)]" /></div>

  if (tasks.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-20 max-w-md mx-auto">
          <p className="text-[var(--text-muted)] text-sm mb-3">本项目还没有任务</p>
          <a href="/command-center" className="text-[var(--accent-light)] text-xs hover:text-white transition-colors">
            前往 Command Center 生成执行计划 →
          </a>
        </div>
      </div>
    )
  }

  const grouped = {
    active: tasks.filter(t => !['completed','approved','archived'].includes(t.workflow_status)),
    done:   tasks.filter(t => ['completed','approved','archived'].includes(t.workflow_status)),
  }

  return (
    <div className="p-6 max-w-5xl">
      <Section title="进行中" tasks={grouped.active} agents={agents} tasksAll={tasks} onRun={runAgent} runningId={running} isBlocked={isBlocked} approvalNotices={approvalNotices} />
      {grouped.done.length > 0 && (
        <Section title="已完成 / 归档" tasks={grouped.done} agents={agents} tasksAll={tasks} onRun={runAgent} runningId={running} isBlocked={() => false} approvalNotices={approvalNotices} muted />
      )}
    </div>
  )
}

interface ApprovalNotice {
  approval_id: string; risk_level: number; required_approvers: string[]; classification_reason: string
}

function Section({ title, tasks, agents, tasksAll, onRun, runningId, isBlocked, approvalNotices, muted }: {
  title: string; tasks: Task[]; agents: Agent[]; tasksAll: Task[];
  onRun: (id: string) => void; runningId: string | null;
  isBlocked: (t: Task) => boolean; muted?: boolean;
  approvalNotices?: Record<string, ApprovalNotice>;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{title} ({tasks.length})</p>
      <div className="space-y-2">
        {tasks.map(t => {
          const agent = agents.find(a => a.id === t.assigned_unit_id || a.id === t.execution_unit_id)
          const blocked = isBlocked(t)
          const statusColor = STATUS_COLOR[t.workflow_status] ?? '#94a3b8'
          const canRun = agent && agent.type !== 'human' && ['planned','assigned','revision_required','draft'].includes(t.workflow_status)
          const notice = approvalNotices?.[t.id]
          return (
            <div key={t.id} className={`glass rounded-xl p-4 ${muted ? 'opacity-60' : ''}`}>
              {notice && (
                <div className="mb-3 px-2.5 py-2 rounded-lg flex items-start gap-2 text-[11px]"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <span className="text-amber-400 mt-0.5">🛡️</span>
                  <div className="flex-1" style={{ color: 'var(--text-secondary)' }}>
                    <p className="text-amber-400 font-semibold mb-0.5">
                      等待审批 · 风险等级 L{notice.risk_level}
                    </p>
                    <p className="mb-1" style={{ color: 'var(--text-muted)' }}>
                      需要 {notice.required_approvers.join('、')} 批准 · {notice.classification_reason}
                    </p>
                    <a href="/approvals" className="text-[var(--accent-light)] hover:underline">→ 前往审批</a>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <span className="text-base shrink-0">{agent?.avatar ?? '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: statusColor, background: `${statusColor}15`, border: `1px solid ${statusColor}40` }}>
                      {STATUS_LABEL[t.workflow_status] ?? t.workflow_status}
                    </span>
                    {t.priority === 'must' && <span className="text-[9px] text-red-400">MUST</span>}
                  </div>
                  {t.description && <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>{t.description}</p>}
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{agent?.name ?? '未分配'}</span>
                    {t.task_type && t.task_type !== 'general' && <><span>·</span><span>{t.task_type}</span></>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {canRun && !blocked && (
                    <button onClick={() => onRun(t.id)} disabled={runningId === t.id}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded transition-all disabled:opacity-40"
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid var(--border-strong)', color: 'var(--accent-light)' }}>
                      {runningId === t.id ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                      运行
                    </button>
                  )}
                  {blocked && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded"
                      style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                      <Lock size={9} /> 阻塞
                    </span>
                  )}
                  {['submitted','under_review','revision_required','approved','completed'].includes(t.workflow_status) && (
                    <a href={`/task-runs?taskId=${t.id}`}
                      onClick={async (e) => {
                        e.preventDefault()
                        const res = await fetch(`/api/task-runs?taskId=${t.id}`)
                        const runs = await res.json().catch(() => [])
                        if (Array.isArray(runs) && runs.length > 0) window.location.href = `/task-runs/${runs[0].id}`
                      }}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-all"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <ExternalLink size={9} /> 结果
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
