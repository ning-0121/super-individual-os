import { describe, it, expect } from 'vitest'
import {
  computeHealthScore, suggestStopContinuePivot, assessTaskFocus, buildHealthDirective,
} from '@/lib/project-context/health'

// ─────────────────────────────────────────────────
// computeHealthScore
// ─────────────────────────────────────────────────
describe('computeHealthScore', () => {
  it('all-zero project is critical', () => {
    const r = computeHealthScore({
      total_tasks: 0, completed_tasks: 0, blocked_tasks: 0,
      activity_count_7d: 0, has_next_actions: false, has_locked_context: false,
    })
    // 0% complete (0pts) + 0 activity (0pts) + 0 blocked (20pts) + 0 + 0 = 20
    expect(r.score).toBe(20)
    expect(r.status).toBe('critical')
  })

  it('perfect inputs → 100 healthy', () => {
    const r = computeHealthScore({
      total_tasks: 10, completed_tasks: 10, blocked_tasks: 0,
      activity_count_7d: 10, has_next_actions: true, has_locked_context: true,
    })
    expect(r.score).toBe(100)
    expect(r.status).toBe('healthy')
  })

  it('completion weights 30% correctly', () => {
    const r = computeHealthScore({
      total_tasks: 10, completed_tasks: 5, blocked_tasks: 0,
      activity_count_7d: 0, has_next_actions: false, has_locked_context: false,
    })
    expect(r.breakdown.task_completion_pts).toBe(15)
  })

  it('blocked penalty caps at 5', () => {
    const a = computeHealthScore({
      total_tasks: 10, completed_tasks: 10, blocked_tasks: 5,
      activity_count_7d: 0, has_next_actions: false, has_locked_context: false,
    })
    const b = computeHealthScore({
      total_tasks: 10, completed_tasks: 10, blocked_tasks: 99,
      activity_count_7d: 0, has_next_actions: false, has_locked_context: false,
    })
    expect(a.breakdown.blocked_penalty_pts).toBe(0)
    expect(b.breakdown.blocked_penalty_pts).toBe(0)
  })

  it('activity saturates at 10 / week', () => {
    const a = computeHealthScore({
      total_tasks: 1, completed_tasks: 0, blocked_tasks: 0,
      activity_count_7d: 10, has_next_actions: false, has_locked_context: false,
    })
    const b = computeHealthScore({
      total_tasks: 1, completed_tasks: 0, blocked_tasks: 0,
      activity_count_7d: 50, has_next_actions: false, has_locked_context: false,
    })
    expect(a.breakdown.recent_activity_pts).toBe(20)
    expect(b.breakdown.recent_activity_pts).toBe(20)
  })

  it('next_actions / locked_context flag pieces are binary', () => {
    const r = computeHealthScore({
      total_tasks: 0, completed_tasks: 0, blocked_tasks: 0,
      activity_count_7d: 0, has_next_actions: true, has_locked_context: true,
    })
    expect(r.breakdown.next_actions_pts).toBe(15)
    expect(r.breakdown.locked_context_pts).toBe(15)
    // 0 + 0 + 20 + 15 + 15 = 50 → warning
    expect(r.score).toBe(50)
    expect(r.status).toBe('warning')
  })

  it('warning threshold is [40,65)', () => {
    expect(computeHealthScore({
      total_tasks: 10, completed_tasks: 4, blocked_tasks: 2,    // 12 + 0 + 12 + 0 + 0 = 24 → critical
      activity_count_7d: 0, has_next_actions: false, has_locked_context: false,
    }).status).toBe('critical')

    expect(computeHealthScore({
      total_tasks: 10, completed_tasks: 4, blocked_tasks: 1,    // 12 + 0 + 16 + 15 + 0 = 43 → warning
      activity_count_7d: 0, has_next_actions: true, has_locked_context: false,
    }).status).toBe('warning')

    expect(computeHealthScore({
      total_tasks: 10, completed_tasks: 7, blocked_tasks: 0,    // 21 + 0 + 20 + 15 + 15 = 71 → healthy
      activity_count_7d: 0, has_next_actions: true, has_locked_context: true,
    }).status).toBe('healthy')
  })
})

// ─────────────────────────────────────────────────
// suggestStopContinuePivot
// ─────────────────────────────────────────────────
describe('suggestStopContinuePivot', () => {
  it('stops dormant zero-progress projects (2+ weeks)', () => {
    const a = suggestStopContinuePivot({
      health_status: 'critical', blocked_tasks: 0,
      activity_count_7d: 0, has_next_actions: false,
      completion_ratio: 0, hours_since_last_activity: 14 * 24 + 1,
    })
    expect(a.recommendation).toBe('stop')
  })

  it('pivots when multi-blocker on warning', () => {
    const a = suggestStopContinuePivot({
      health_status: 'warning', blocked_tasks: 5,
      activity_count_7d: 3, has_next_actions: true,
      completion_ratio: 0.4, hours_since_last_activity: 12,
    })
    expect(a.recommendation).toBe('pivot')
  })

  it('pivots critical + many blockers', () => {
    const a = suggestStopContinuePivot({
      health_status: 'critical', blocked_tasks: 4,
      activity_count_7d: 2, has_next_actions: true,
      completion_ratio: 0.2, hours_since_last_activity: 24,
    })
    expect(a.recommendation).toBe('pivot')
  })

  it('continues when healthy', () => {
    const a = suggestStopContinuePivot({
      health_status: 'healthy', blocked_tasks: 0,
      activity_count_7d: 5, has_next_actions: true,
      completion_ratio: 0.5, hours_since_last_activity: 6,
    })
    expect(a.recommendation).toBe('continue')
  })

  it('continues with warning if still moving + has next', () => {
    const a = suggestStopContinuePivot({
      health_status: 'warning', blocked_tasks: 1,
      activity_count_7d: 3, has_next_actions: true,
      completion_ratio: 0.3, hours_since_last_activity: 24,
    })
    expect(a.recommendation).toBe('continue')
    expect(a.confidence).toBeLessThanOrEqual(0.7)
  })
})

// ─────────────────────────────────────────────────
// assessTaskFocus
// ─────────────────────────────────────────────────
describe('assessTaskFocus', () => {
  it('no goal set → never flagged', () => {
    expect(assessTaskFocus({
      task_title: 'random task', project_goal: '',
    }).off_focus).toBe(false)
  })

  it('English overlap passes', () => {
    const r = assessTaskFocus({
      task_title: 'Build AI persona content factory landing page',
      project_goal: 'Build AI persona content factory for historical figures',
    })
    expect(r.off_focus).toBe(false)
    expect(r.similarity).toBeGreaterThan(0.3)
  })

  it('English mismatch flags', () => {
    const r = assessTaskFocus({
      task_title: 'fix accounting tax invoice',
      project_goal: 'AI persona content factory talkshow',
    })
    expect(r.off_focus).toBe(true)
  })

  it('Chinese overlap passes (bigram)', () => {
    const r = assessTaskFocus({
      task_title: '调研历史人物脱口秀脚本',
      project_goal: 'AI 人格内容工厂做历史人物脱口秀',
    })
    expect(r.off_focus).toBe(false)
  })

  it('Chinese mismatch flags', () => {
    const r = assessTaskFocus({
      task_title: '记录今天的健身计划',
      project_goal: 'AI 人格内容工厂',
    })
    expect(r.off_focus).toBe(true)
  })

  it('Mixed-language overlap counts both halves', () => {
    const r = assessTaskFocus({
      task_title: '写 landing page 内容',
      project_goal: 'Build landing page for 内容工厂',
    })
    expect(r.off_focus).toBe(false)
  })
})

// ─────────────────────────────────────────────────
// buildHealthDirective
// ─────────────────────────────────────────────────
describe('buildHealthDirective', () => {
  it('returns null for healthy', () => {
    expect(buildHealthDirective('healthy')).toBeNull()
  })
  it('mentions warning + does NOT propose new features', () => {
    const d = buildHealthDirective('warning')!
    expect(d).toMatch(/warning/)
    expect(d).toMatch(/不要建议扩展新功能/)
  })
  it('mentions critical', () => {
    expect(buildHealthDirective('critical')!).toMatch(/critical/)
  })
})
