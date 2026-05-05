import { describe, it, expect } from 'vitest'
import { computeStatus, computeProgress, computeRisk } from '@/services/systems'

describe('computeStatus — V2.1+ rules', () => {
  it('returns "error" if any failed run in last 24h', () => {
    expect(computeStatus({
      open_tasks: 5, total_tasks: 10,
      failed_runs_24h: 1, runs_in_last_6h: 0, runs_in_last_48h: 2,
    })).toBe('error')
  })

  it('returns "running" if runs in last 6h', () => {
    expect(computeStatus({
      open_tasks: 5, total_tasks: 10,
      failed_runs_24h: 0, runs_in_last_6h: 3, runs_in_last_48h: 5,
    })).toBe('running')
  })

  it('returns "blocked" if open tasks but no runs in 48h', () => {
    expect(computeStatus({
      open_tasks: 3, total_tasks: 5,
      failed_runs_24h: 0, runs_in_last_6h: 0, runs_in_last_48h: 0,
    })).toBe('blocked')
  })

  it('returns "idle" if no open tasks and no recent runs', () => {
    expect(computeStatus({
      open_tasks: 0, total_tasks: 5,
      failed_runs_24h: 0, runs_in_last_6h: 0, runs_in_last_48h: 0,
    })).toBe('idle')
  })

  it('"error" outranks "running"', () => {
    expect(computeStatus({
      open_tasks: 5, total_tasks: 10,
      failed_runs_24h: 1, runs_in_last_6h: 5, runs_in_last_48h: 10,
    })).toBe('error')
  })

  it('"running" outranks "blocked"', () => {
    expect(computeStatus({
      open_tasks: 5, total_tasks: 10,
      failed_runs_24h: 0, runs_in_last_6h: 1, runs_in_last_48h: 1,
    })).toBe('running')
  })
})

describe('computeProgress', () => {
  it('returns 0 when no tasks', () => {
    expect(computeProgress({ completed_tasks: 0, total_tasks: 0 })).toBe(0)
  })
  it('returns rounded percentage', () => {
    expect(computeProgress({ completed_tasks: 1, total_tasks: 3 })).toBe(33)
    expect(computeProgress({ completed_tasks: 5, total_tasks: 10 })).toBe(50)
    expect(computeProgress({ completed_tasks: 10, total_tasks: 10 })).toBe(100)
  })
})

describe('computeRisk — graduated', () => {
  it('returns 0 (calm) for clean state', () => {
    expect(computeRisk({
      failed_runs_24h: 0, blocked_tasks: 0,
      pending_ceo_approvals: 0, no_activity_hours: 1,
    })).toBe(0)
  })
  it('low risk (1) for one failure', () => {
    expect(computeRisk({
      failed_runs_24h: 1, blocked_tasks: 0,
      pending_ceo_approvals: 0, no_activity_hours: 1,
    })).toBe(1)
  })
  it('medium (2) for repeated failures', () => {
    expect(computeRisk({
      failed_runs_24h: 3, blocked_tasks: 1,
      pending_ceo_approvals: 0, no_activity_hours: 1,
    })).toBe(2)
  })
  it('high (3) for many failures + pending CEO + stale', () => {
    expect(computeRisk({
      failed_runs_24h: 5, blocked_tasks: 3,
      pending_ceo_approvals: 2, no_activity_hours: 72,
    })).toBe(3)
  })
})
