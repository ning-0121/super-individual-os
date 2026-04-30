'use client'
import { useEffect, useState, useCallback } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import { Project, Task, ExecutionUnit, WorkflowStatus, AgentType } from '@/types'
import { getProjects } from '@/services/projects'
import { AGENT_TYPE_META } from '@/services/agents'
import { Plus, Zap, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Target, Users } from 'lucide-react'

const WORKFLOW_META: Record<WorkflowStatus, { label: string; color: string; dot: string }> = {
  draft:             { label: '草稿',   color: 'text-slate-400',   dot: 'bg-slate-500' },
  planned:           { label: '已规划', color: 'text-cyan-400',    dot: 'bg-cyan-400' },
  assigned:          { label: '已分配', color: 'text-blue-400',    dot: 'bg-blue-400' },
  running:           { label: '执行中', color: 'text-amber-400',   dot: 'bg-amber-400' },
  blocked:           { label: '阻塞',   color: 'text-red-400',     dot: 'bg-red-500' },
  submitted:         { label: '已提交', color: 'text-violet-400',  dot: 'bg-violet-400' },
  under_review:      { label: '审核中', color: 'text-orange-400',  dot: 'bg-orange-400' },
  revision_required: { label: '需返工', color: 'text-red-400',     dot: 'bg-red-400' },
  approved:          { label: '已审批', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  completed:         { label: '已完成', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  archived:          { label: '已归档', color: 'text-slate-500',   dot: 'bg-slate-600' },
}

const PRIORITY_COLOR: Record<string, string> = {
  must: 'text-red-400', important: 'text-amber-400', optional: 'text-slate-400',
}

export default function CommandCenterPage() {
  const [projects, setProjects]     = useState<Project[]>([])
  const [tasks, setTasks]           = useState<Record<string, Task[]>>({})
  const [agents, setAgents]         = useState<ExecutionUnit[]>([])
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [goal, setGoal]             = useState('')
  const [showGoalInput, setShowGoalInput] = useState<string | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [updatingTask, setUpdatingTask]   = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [projs, agentData] = await Promise.all([
        getProjects(),
        fetch('/api/agents').then(r => r.json()).catch(() => []),
      ])
      setProjects(projs)
      setAgents(Array.isArray(agentData) ? agentData : [])
      if (projs.length > 0) setActiveProject(projs[0].id)
      setLoading(false)
    }
    load()
  }, [])

  const loadProjectTasks = useCallback(async (projectId: string) => {
    if (tasks[projectId]) return
    const res = await fetch(`/api/tasks?projectId=${projectId}`).catch(() => null)
    if (!res?.ok) return
    const data = await res.json()
    setTasks(prev => ({ ...prev, [projectId]: data }))
  }, [tasks])

  useEffect(() => {
    if (activeProject) loadProjectTasks(activeProject)
  }, [activeProject, loadProjectTasks])

  async function generatePlan(projectId: string) {
    if (!goal.trim()) return
    setGenerating(projectId)
    const res = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, goal, context: projects.find(p => p.id === projectId)?.description }),
    })
    const data = await res.json()
    if (data.tasks) {
      setTasks(prev => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), ...data.tasks] }))
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, plan_generated: true, goal_statement: goal } : p))
    }
    setGenerating(null); setShowGoalInput(null); setGoal('')
  }

  async function updateWorkflowStatus(taskId: string, newStatus: WorkflowStatus, projectId: string) {
    setUpdatingTask(taskId)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_status: newStatus }),
    })
    setTasks(prev => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map(t => t.id === taskId ? { ...t, workflow_status: newStatus } : t),
    }))
    setUpdatingTask(null)
  }

  const proj = projects.find(p => p.id === activeProject)
  const projTasks = tasks[activeProject ?? ''] ?? []
  const rootTasks = projTasks.filter(t => !t.parent_task_id)
  const completedCount = projTasks.filter(t => t.workflow_status === 'completed' || t.workflow_status === 'approved').length
  const progress = projTasks.length > 0 ? Math.round((completedCount / projTasks.length) * 100) : 0
  const reviewPending = projTasks.filter(t => t.workflow_status === 'submitted' || t.workflow_status === 'under_review').length
  const blocked = projTasks.filter(t => t.workflow_status === 'blocked').length

  return (
    <div className="flex h-screen bg-grid" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />

      {/* Left: Project list */}
      <div className="w-56 border-r border-[var(--border)] flex flex-col glass shrink-0">
        <div className="p-3 border-b border-[var(--border)]">
          <p className="text-[10px] font-mono text-[var(--accent-light)] tracking-widest uppercase mb-2">Command Center</p>
          <a href="/projects"
            className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
            <Plus size={11} /> 新建项目
          </a>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {loading && <p className="text-[10px] text-center py-6" style={{ color: 'var(--text-muted)' }}>加载中...</p>}
          {projects.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${activeProject === p.id ? 'bg-white/8 text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-white/5'}`}>
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {p.plan_generated ? `${(tasks[p.id] ?? []).length} 个任务` : '未生成计划'}
              </p>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-[var(--border)]">
          <a href="/agents" className="block px-3 py-2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2">
            <Users size={10} /> AI Workforce ({agents.length})
          </a>
        </div>
      </div>

      {/* Main: Command panel */}
      <main className="flex-1 overflow-auto flex flex-col">
        {!proj ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Target size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-[var(--text-muted)] text-sm">选择项目或创建新项目</p>
              <a href="/projects" className="text-[var(--accent-light)] text-xs mt-2 inline-block hover:text-white transition-colors">
                前往项目管理 →
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Project header */}
            <div className="border-b border-[var(--border)] px-6 py-4 glass shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[var(--accent-light)] uppercase tracking-widest">Project</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                      {proj.status}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{proj.name}</h2>
                  {proj.goal_statement && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{proj.goal_statement}</p>
                  )}
                </div>

                {/* Generate plan */}
                {showGoalInput === proj.id ? (
                  <div className="flex items-center gap-2 flex-1 ml-6">
                    <input autoFocus value={goal} onChange={e => setGoal(e.target.value)}
                      placeholder="描述这个项目的目标（AI 会生成执行计划）..."
                      className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      onKeyDown={e => { if (e.key === 'Enter') generatePlan(proj.id) }} />
                    <button onClick={() => generatePlan(proj.id)} disabled={generating === proj.id || !goal.trim()}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                      style={{ background: 'var(--accent)', color: 'white' }}>
                      {generating === proj.id ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                      生成
                    </button>
                    <button onClick={() => { setShowGoalInput(null); setGoal('') }}
                      className="text-xs px-2 py-2" style={{ color: 'var(--text-muted)' }}>取消</button>
                  </div>
                ) : (
                  <button onClick={() => setShowGoalInput(proj.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
                    style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)', border: '1px solid var(--border-strong)' }}>
                    <Zap size={11} /> {proj.plan_generated ? '重新生成计划' : '生成执行计划'}
                  </button>
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4">
                {/* Progress bar */}
                <div className="flex-1 max-w-xs">
                  <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>任务进度</span>
                    <span>{completedCount}/{projTasks.length}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex gap-3 text-[10px]">
                  {reviewPending > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Clock size={9} /> {reviewPending} 待审核
                    </span>
                  )}
                  {blocked > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertTriangle size={9} /> {blocked} 阻塞
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={9} /> {completedCount} 完成
                  </span>
                </div>
              </div>
            </div>

            {/* Task tree */}
            <div className="flex-1 overflow-auto p-6">
              {projTasks.length === 0 ? (
                <div className="text-center py-20">
                  <Zap size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-[var(--text-muted)] text-sm mb-4">还没有执行计划</p>
                  <p className="text-[var(--text-muted)] text-xs">点击右上角「生成执行计划」，让 AI 自动拆解任务并分配 Agent</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-3xl">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">任务树</p>
                    <button onClick={() => loadProjectTasks(activeProject!)}
                      className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
                      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      <RefreshCw size={8} /> 刷新
                    </button>
                  </div>

                  {rootTasks.map(task => (
                    <TaskTreeNode
                      key={task.id}
                      task={task}
                      subtasks={projTasks.filter(t => t.parent_task_id === task.id)}
                      agents={agents}
                      expanded={expandedTasks}
                      onToggle={(id) => setExpandedTasks(prev => {
                        const next = new Set(prev)
                        next.has(id) ? next.delete(id) : next.add(id)
                        return next
                      })}
                      onUpdateStatus={(taskId, status) => updateWorkflowStatus(taskId, status, activeProject!)}
                      updatingId={updatingTask}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function TaskTreeNode({ task, subtasks, agents, expanded, onToggle, onUpdateStatus, updatingId, depth = 0 }: {
  task: Task
  subtasks: Task[]
  agents: ExecutionUnit[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdateStatus: (taskId: string, status: WorkflowStatus) => void
  updatingId: string | null
  depth?: number
}) {
  const isExpanded = expanded.has(task.id)
  const meta = WORKFLOW_META[task.workflow_status ?? 'draft'] ?? WORKFLOW_META.draft
  const prioColor = PRIORITY_COLOR[task.priority] ?? 'text-slate-400'
  const agent = agents.find(a => a.id === task.assigned_unit_id || a.id === task.execution_unit_id)
  const agentMeta = agent ? (AGENT_TYPE_META[agent.agent_type ?? 'general'] ?? AGENT_TYPE_META.general) : null
  const hasSubtasks = subtasks.length > 0

  const NEXT_STATUSES: Record<WorkflowStatus, WorkflowStatus[]> = {
    draft:             ['planned', 'archived'],
    planned:           ['assigned', 'draft'],
    assigned:          ['running', 'blocked'],
    running:           ['submitted', 'blocked'],
    blocked:           ['running', 'assigned'],
    submitted:         ['under_review', 'running'],
    under_review:      ['approved', 'revision_required'],
    revision_required: ['running'],
    approved:          ['completed'],
    completed:         ['archived'],
    archived:          [],
  }

  const nextStatuses = NEXT_STATUSES[task.workflow_status ?? 'draft'] ?? []

  return (
    <div style={{ marginLeft: depth > 0 ? `${depth * 20}px` : '0' }}>
      <div className="glass rounded-xl p-4 group">
        <div className="flex items-start gap-3">
          {/* Expand toggle */}
          <button onClick={() => hasSubtasks && onToggle(task.id)}
            className={`shrink-0 mt-0.5 transition-colors ${hasSubtasks ? 'cursor-pointer' : 'opacity-0'}`}
            style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</p>
              </div>
              {/* Priority */}
              <span className={`text-[9px] font-mono shrink-0 ${prioColor}`}>{task.priority.toUpperCase()}</span>
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-xs mb-2 ml-3.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{task.description}</p>
            )}

            {/* Badges row */}
            <div className="flex items-center gap-2 ml-3.5 flex-wrap">
              {/* Status */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${meta.color}`}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                {meta.label}
              </span>

              {/* Agent */}
              {agent && agentMeta && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${agentMeta.color}`}
                  style={{ background: agentMeta.bg, border: '1px solid var(--border)' }}>
                  {agent.avatar} {agent.name}
                </span>
              )}

              {/* Task type */}
              {task.task_type && task.task_type !== 'general' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {task.task_type}
                </span>
              )}

              {/* Status transitions */}
              {nextStatuses.length > 0 && (
                <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  {nextStatuses.slice(0,3).map(s => (
                    <button key={s} onClick={() => onUpdateStatus(task.id, s)}
                      disabled={updatingId === task.id}
                      className="text-[8px] px-1.5 py-0.5 rounded transition-colors disabled:opacity-40"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {WORKFLOW_META[s]?.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Acceptance criteria */}
            {task.acceptance_criteria && (
              <div className="mt-2 ml-3.5 text-[9px] px-2 py-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <span className="text-emerald-400 font-semibold">验收标准：</span>
                <span style={{ color: 'var(--text-muted)' }}>{task.acceptance_criteria}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtasks */}
      {isExpanded && subtasks.map(sub => (
        <div key={sub.id} className="mt-1.5 ml-4 pl-3 border-l border-[var(--border)]">
          <TaskTreeNode
            task={sub} subtasks={[]} agents={agents}
            expanded={expanded} onToggle={onToggle}
            onUpdateStatus={onUpdateStatus} updatingId={updatingId}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  )
}
