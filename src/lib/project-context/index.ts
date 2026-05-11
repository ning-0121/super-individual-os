import type { ProjectContext, ProjectActivityLog, ProjectActivityType } from '@/types'

// ─────────────────────────────────────────────────
// V2.5 — Project Memory Kernel — pure helpers
// All functions here are deterministic and side-effect free
// for easy testing. DB orchestration lives in services/project-context.ts.
// ─────────────────────────────────────────────────

// ─────────────────────────────────────────
// Build the "Project Locked Context" block injected into AI prompts.
// Returned text MUST be prepended to system prompt when project_id present.
// ─────────────────────────────────────────
export interface PromptBlockOptions {
  project_name?: string
  include_hard_rules?: boolean      // default true
  max_items_per_section?: number    // default 5
}

export function buildProjectPromptBlock(
  ctx: ProjectContext,
  opts: PromptBlockOptions = {},
): string {
  const max = opts.max_items_per_section ?? 5
  const lines: string[] = []

  lines.push('## Project Locked Context')
  if (opts.project_name) lines.push(`**Project:** ${opts.project_name}`)
  lines.push(`**Context Version:** v${ctx.context_version}${ctx.locked ? ' (LOCKED)' : ''}`)
  lines.push('')

  if (ctx.project_goal) {
    lines.push('### Project Goal')
    lines.push(ctx.project_goal)
    lines.push('')
  }
  if (ctx.current_stage) {
    lines.push(`**Current Stage:** ${ctx.current_stage}`)
  }
  if (ctx.current_focus) {
    lines.push(`**Current Focus:** ${ctx.current_focus}`)
  }
  lines.push('')

  if (ctx.key_decisions.length > 0) {
    lines.push('### Key Decisions')
    for (const d of ctx.key_decisions.slice(-max)) lines.push(`- ${d.text}`)
    lines.push('')
  }
  if (ctx.forbidden_changes.length > 0) {
    lines.push('### ⛔ Forbidden Changes (do NOT modify or suggest changes to these)')
    for (const f of ctx.forbidden_changes.slice(0, max)) lines.push(`- ${f}`)
    lines.push('')
  }
  if (ctx.completed_items.length > 0) {
    lines.push('### Completed Items')
    for (const c of ctx.completed_items.slice(-max)) lines.push(`- ${c.text}`)
    lines.push('')
  }
  if (ctx.blockers.length > 0) {
    lines.push('### Blockers')
    for (const b of ctx.blockers.slice(-max)) lines.push(`- ${b.text}`)
    lines.push('')
  }
  if (ctx.next_actions.length > 0) {
    lines.push('### Next Actions')
    for (const n of ctx.next_actions.slice(0, max)) lines.push(`- ${n.text}`)
    lines.push('')
  }
  if (ctx.important_files.length > 0) {
    lines.push('### Important Files')
    for (const f of ctx.important_files.slice(0, max)) lines.push(`- \`${f}\``)
    lines.push('')
  }
  if (ctx.last_ai_summary) {
    lines.push('### Last AI Summary')
    lines.push(ctx.last_ai_summary)
    lines.push('')
  }

  if (opts.include_hard_rules !== false) {
    lines.push('---')
    lines.push('### Hard Rules')
    lines.push('1. You MUST answer based on the Project Locked Context above.')
    lines.push('2. Do NOT mix in context from other projects.')
    lines.push('3. Do NOT propose changes to anything listed under Forbidden Changes.')
    lines.push('4. If information is insufficient, first reason from this project context. Only then ask at most 1–2 clarifying questions.')
    lines.push('5. If the user mentions a different project by name, ask whether to switch context — do not silently merge.')
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────
// Cross-project mention detector.
// Returns the names of OTHER projects mentioned in the user input.
// Used to surface "switch context?" warnings.
// ─────────────────────────────────────────
export interface ProjectIdentifier { id: string; name: string }

export function detectCrossProjectMention(
  input: string,
  currentProjectId: string | null,
  allProjects: ProjectIdentifier[],
): ProjectIdentifier[] {
  if (!input || input.length < 3) return []
  const lower = input.toLowerCase()
  const hits: ProjectIdentifier[] = []
  for (const p of allProjects) {
    if (!p.name || p.name.length < 2) continue
    if (currentProjectId && p.id === currentProjectId) continue
    if (lower.includes(p.name.toLowerCase())) {
      hits.push(p)
    }
  }
  return hits
}

// ─────────────────────────────────────────
// Generate Handoff Summary — pure, text-only.
// Caller fetches the activity slice; this just formats.
// ─────────────────────────────────────────
export interface HandoffInputs {
  project_name: string
  ctx: ProjectContext
  recent_activity: ProjectActivityLog[]
}

export interface HandoffSummary {
  what_is_this_project: string
  current_progress: string
  recent_completions: string[]
  biggest_risk: string
  next_step: string
  forbidden: string[]
  onboarding_checklist: string[]
  text: string
}

export function summarizeForHandoff(input: HandoffInputs): HandoffSummary {
  const { ctx, project_name, recent_activity } = input

  const what_is_this_project = ctx.project_goal ||
    `${project_name} — 项目目标尚未填写`

  const current_progress = ctx.current_stage
    ? `当前阶段：${ctx.current_stage}${ctx.current_focus ? `；焦点：${ctx.current_focus}` : ''}`
    : '阶段尚未明确'

  const recent_completions = ctx.completed_items.slice(-5).map(c => c.text)
  // If completed_items is sparse, fall back to recent activity titles
  if (recent_completions.length < 3) {
    for (const a of recent_activity.slice(0, 5)) {
      if (a.title && !recent_completions.includes(a.title)) {
        recent_completions.push(a.title)
      }
      if (recent_completions.length >= 5) break
    }
  }

  const biggest_risk = ctx.blockers[0]?.text
    ?? recent_activity.find(a => a.activity_type === 'risk')?.summary
    ?? '当前未识别到关键风险'

  const next_step = ctx.next_actions[0]?.text ?? '尚未明确下一步'

  const forbidden = ctx.forbidden_changes.slice(0, 5)

  const onboarding_checklist = [
    `阅读项目目标（见 "Project Goal"）`,
    ctx.important_files.length > 0
      ? `检查关键文件：${ctx.important_files.slice(0, 3).join(', ')}`
      : '检查最近 3-5 条 project_activity_logs',
    ctx.last_ai_summary ? '阅读 Last AI Summary' : '回顾最近的 manager_reports',
    ctx.forbidden_changes.length > 0
      ? '了解 Forbidden Changes 清单'
      : '与负责人对齐当前阶段',
    `继续推进 Next Action: ${next_step}`,
  ]

  // Render the canonical text blob
  const lines: string[] = []
  lines.push(`# Handoff: ${project_name}`)
  lines.push(`> Generated for new agent / engineer.  Context version v${ctx.context_version}.`)
  lines.push('')
  lines.push(`## 这个项目是什么\n${what_is_this_project}`)
  lines.push('')
  lines.push(`## 当前做到了哪一步\n${current_progress}`)
  lines.push('')
  if (recent_completions.length) {
    lines.push('## 最近完成了什么')
    for (const c of recent_completions) lines.push(`- ${c}`)
    lines.push('')
  }
  lines.push(`## 当前最大风险\n${biggest_risk}`)
  lines.push('')
  lines.push(`## 下一步该做什么\n${next_step}`)
  lines.push('')
  if (forbidden.length) {
    lines.push('## ⛔ 哪些不能动')
    for (const f of forbidden) lines.push(`- ${f}`)
    lines.push('')
  }
  lines.push('## 如果交给新 Agent / 新工程师，应该先看什么')
  for (const c of onboarding_checklist) lines.push(`- ${c}`)

  return {
    what_is_this_project,
    current_progress,
    recent_completions,
    biggest_risk,
    next_step,
    forbidden,
    onboarding_checklist,
    text: lines.join('\n'),
  }
}

// ─────────────────────────────────────────
// Merge an activity event into the context — returns the next-version
// context payload to be persisted. Pure / deterministic.
// ─────────────────────────────────────────
export interface ActivityEvent {
  activity_type: ProjectActivityType
  title: string
  summary?: string
  metadata?: Record<string, unknown>
}

export function mergeActivityIntoContext(
  ctx: ProjectContext, event: ActivityEvent, now: string = new Date().toISOString(),
): Partial<ProjectContext> {
  const patch: Partial<ProjectContext> = {
    context_version: ctx.context_version + 1,
    updated_at: now,
  }

  switch (event.activity_type) {
    case 'task_update':
    case 'workflow_update': {
      // If completion-flavored, append to completed_items
      if (/complet|done|完成|✓/i.test(event.title) || event.metadata?.status === 'completed') {
        patch.completed_items = [...ctx.completed_items, { at: now, text: event.title }].slice(-50)
      }
      break
    }
    case 'decision': {
      patch.key_decisions = [...ctx.key_decisions, { at: now, text: event.title }].slice(-50)
      break
    }
    case 'risk': {
      // Add to blockers if it's a real block; otherwise just log
      if (/block|阻塞|stuck|critical/i.test(event.title)) {
        patch.blockers = [...ctx.blockers, { at: now, text: event.title }].slice(-20)
      }
      break
    }
    case 'manager_report':
    case 'ai_summary': {
      if (event.summary) patch.last_ai_summary = event.summary
      // Pull next_action from metadata if provided
      const next = event.metadata?.next_action as string | undefined
      if (next) {
        patch.next_actions = [{ at: now, text: next }, ...ctx.next_actions].slice(0, 20)
      }
      break
    }
    case 'deployment': {
      patch.deployment_notes = [...ctx.deployment_notes, `[${now}] ${event.title}`].slice(-20)
      break
    }
    case 'approval': {
      // Bump version only; activity log captures the detail
      break
    }
    case 'code_change':
    case 'bug':
    case 'context_update':
      // Fall through — only bumps version + updated_at
      break
  }

  return patch
}
