import { describe, it, expect } from 'vitest'
import {
  buildProjectPromptBlock,
  detectCrossProjectMention,
  summarizeForHandoff,
  mergeActivityIntoContext,
} from '@/lib/project-context'
import type { ProjectContext, ProjectActivityLog } from '@/types'

function ctx(over: Partial<ProjectContext> = {}): ProjectContext {
  return {
    id: 'pc-1', user_id: 'u-1', project_id: 'p-1',
    project_goal: '', current_stage: '', current_focus: '',
    tech_stack: {},
    key_decisions: [], completed_items: [], blockers: [], next_actions: [],
    forbidden_changes: [], important_files: [],
    database_notes: {}, deployment_notes: [],
    active_workflow_id: null, owner_execution_unit_id: null,
    last_ai_summary: '', context_version: 1,
    locked: false, locked_at: null,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over,
  }
}

// ─────────────────────────────────────────────────
// buildProjectPromptBlock
// ─────────────────────────────────────────────────
describe('buildProjectPromptBlock', () => {
  it('produces required header + hard-rules by default', () => {
    const text = buildProjectPromptBlock(ctx({ project_goal: 'Build A' }), { project_name: 'AlphaFactory' })
    expect(text).toMatch(/## Project Locked Context/)
    expect(text).toMatch(/AlphaFactory/)
    expect(text).toMatch(/### Hard Rules/)
    expect(text).toMatch(/Forbidden Changes/)
    expect(text).toMatch(/MUST answer based on the Project Locked Context/)
  })

  it('omits hard rules when include_hard_rules=false', () => {
    const text = buildProjectPromptBlock(ctx({}), { include_hard_rules: false })
    expect(text).not.toMatch(/### Hard Rules/)
  })

  it('lists forbidden changes prominently', () => {
    const text = buildProjectPromptBlock(ctx({
      forbidden_changes: ['不要重命名 users 表', '不要修改 auth schema'],
    }))
    expect(text).toMatch(/⛔/)
    expect(text).toMatch(/不要重命名 users 表/)
    expect(text).toMatch(/不要修改 auth schema/)
  })

  it('respects max_items_per_section cap', () => {
    const c = ctx({
      key_decisions: Array.from({ length: 10 }, (_, i) => ({ at: '2026-05-11', text: `D${i}` })),
    })
    const text = buildProjectPromptBlock(c, { max_items_per_section: 3 })
    const matches = text.match(/^- D\d+/gm) ?? []
    // 3 cap → last 3 decisions only (slice(-3) === D7, D8, D9)
    expect(matches.length).toBe(3)
  })

  it('shows LOCKED tag when locked', () => {
    expect(buildProjectPromptBlock(ctx({ locked: true }))).toMatch(/LOCKED/)
    expect(buildProjectPromptBlock(ctx({ locked: false }))).not.toMatch(/LOCKED/)
  })
})

// ─────────────────────────────────────────────────
// detectCrossProjectMention
// ─────────────────────────────────────────────────
describe('detectCrossProjectMention', () => {
  const projects = [
    { id: 'A', name: 'AlphaFactory' },
    { id: 'B', name: 'BravoCRM' },
    { id: 'C', name: 'X' },                // too short — should be ignored
  ]

  it('detects another project mentioned in input', () => {
    const hits = detectCrossProjectMention('I want to also work on BravoCRM today', 'A', projects)
    expect(hits.map(h => h.id)).toEqual(['B'])
  })

  it('ignores the current project name', () => {
    const hits = detectCrossProjectMention('AlphaFactory needs more tasks', 'A', projects)
    expect(hits).toEqual([])
  })

  it('returns empty for vacuous input', () => {
    expect(detectCrossProjectMention('', 'A', projects)).toEqual([])
    expect(detectCrossProjectMention('hi', 'A', projects)).toEqual([])
  })

  it('skips projects whose name is shorter than 2 chars', () => {
    expect(detectCrossProjectMention('the X is X', 'A', projects)).toEqual([])
  })

  it('case-insensitive match', () => {
    const hits = detectCrossProjectMention('switch to BRAVOCRM', 'A', projects)
    expect(hits.map(h => h.id)).toEqual(['B'])
  })

  it('returns multiple hits when many projects mentioned', () => {
    const hits = detectCrossProjectMention('compare AlphaFactory and BravoCRM', null, projects)
    expect(hits.map(h => h.id).sort()).toEqual(['A', 'B'])
  })
})

// ─────────────────────────────────────────────────
// summarizeForHandoff
// ─────────────────────────────────────────────────
describe('summarizeForHandoff', () => {
  function activity(over: Partial<ProjectActivityLog> = {}): ProjectActivityLog {
    return {
      id: 'a-1', user_id: 'u', project_id: 'p',
      activity_type: 'task_update', title: '', summary: '', metadata: {},
      created_at: new Date().toISOString(),
      ...over,
    }
  }

  it('falls back to project name when goal blank', () => {
    const s = summarizeForHandoff({
      project_name: 'My Side Project',
      ctx: ctx({}), recent_activity: [],
    })
    expect(s.what_is_this_project).toMatch(/My Side Project/)
  })

  it('surfaces top blocker as biggest_risk', () => {
    const s = summarizeForHandoff({
      project_name: 'A',
      ctx: ctx({ blockers: [{ at: 'now', text: '依赖库授权未完成' }] }),
      recent_activity: [],
    })
    expect(s.biggest_risk).toMatch(/依赖库授权/)
  })

  it('falls back to recent risk activity if no blocker', () => {
    const s = summarizeForHandoff({
      project_name: 'A', ctx: ctx({}),
      recent_activity: [activity({ activity_type: 'risk', summary: 'API quota tightening' })],
    })
    expect(s.biggest_risk).toMatch(/API quota/)
  })

  it('uses first next_action as next_step', () => {
    const s = summarizeForHandoff({
      project_name: 'A',
      ctx: ctx({ next_actions: [
        { at: 'now', text: '上线 landing page' },
        { at: 'now', text: '另一个事' },
      ]}),
      recent_activity: [],
    })
    expect(s.next_step).toBe('上线 landing page')
  })

  it('text blob contains all required sections', () => {
    const s = summarizeForHandoff({
      project_name: 'A', ctx: ctx({ project_goal: 'Test goal' }), recent_activity: [],
    })
    expect(s.text).toMatch(/# Handoff: A/)
    expect(s.text).toMatch(/## 这个项目是什么/)
    expect(s.text).toMatch(/## 当前做到了哪一步/)
    expect(s.text).toMatch(/## 当前最大风险/)
    expect(s.text).toMatch(/## 下一步该做什么/)
    expect(s.text).toMatch(/应该先看什么/)
  })

  it('forbidden block surfaces in onboarding', () => {
    const s = summarizeForHandoff({
      project_name: 'A',
      ctx: ctx({ forbidden_changes: ['不要碰 auth schema'] }),
      recent_activity: [],
    })
    expect(s.forbidden).toContain('不要碰 auth schema')
    expect(s.text).toMatch(/不要碰 auth schema/)
  })
})

// ─────────────────────────────────────────────────
// mergeActivityIntoContext
// ─────────────────────────────────────────────────
describe('mergeActivityIntoContext', () => {
  it('always bumps context_version', () => {
    const patch = mergeActivityIntoContext(ctx({ context_version: 5 }), {
      activity_type: 'code_change', title: 'Refactor router',
    })
    expect(patch.context_version).toBe(6)
    expect(patch.updated_at).toBeTruthy()
  })

  it('decision → appends to key_decisions', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'decision', title: '采用 Supabase 不用自建',
    })
    expect(patch.key_decisions).toHaveLength(1)
    expect(patch.key_decisions![0].text).toMatch(/Supabase/)
  })

  it('task_update with completion keyword → adds to completed_items', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'task_update', title: '完成: 写好登录页',
    })
    expect(patch.completed_items).toHaveLength(1)
  })

  it('task_update without completion keyword → does NOT add to completed_items', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'task_update', title: 'Starting login refactor',
    })
    expect(patch.completed_items).toBeUndefined()
  })

  it('risk with block keyword adds to blockers', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'risk', title: 'API quota blockage 阻塞 next deploy',
    })
    expect(patch.blockers).toHaveLength(1)
  })

  it('manager_report sets last_ai_summary and prepends next_action', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'manager_report',
      title: 'CTO daily',
      summary: 'system healthy; one staging migration pending',
      metadata: { next_action: '验证 staging migration' },
    })
    expect(patch.last_ai_summary).toMatch(/staging migration/)
    expect(patch.next_actions?.[0].text).toMatch(/验证 staging migration/)
  })

  it('deployment appends to deployment_notes', () => {
    const patch = mergeActivityIntoContext(ctx({}), {
      activity_type: 'deployment', title: 'preview deploy v12',
    })
    expect(patch.deployment_notes).toBeTruthy()
    expect(patch.deployment_notes![0]).toMatch(/preview deploy v12/)
  })
})
