import { describe, it, expect } from 'vitest'
import { nextRunTransition } from '@/lib/local-agent/state'

describe('nextRunTransition — cloud result transitions', () => {
  const now = new Date('2026-05-13T12:00:00Z')

  it('transitions pending_approval → success for a read-only verb', () => {
    const t = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.git_status' },
      { posted_status: 'success', result: { branch: 'main' }, duration_ms: 120 },
      now,
    )
    expect(t.action).toBe('update')
    if (t.action !== 'update') return
    expect(t.update.status).toBe('success')
    expect(t.update.result).toEqual({ branch: 'main' })
    expect(t.update.duration_ms).toBe(120)
    expect(t.update.finished_at).toBe(now.toISOString())
  })

  it('transitions pending_approval → error with error_message', () => {
    const t = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.git_branch' },
      { posted_status: 'error', error_message: 'not a git repo' },
      now,
    )
    expect(t.action).toBe('update')
    if (t.action !== 'update') return
    expect(t.update.status).toBe('error')
    expect(t.update.error_message).toBe('not a git repo')
  })

  it('is idempotent on terminal rows', () => {
    const s = nextRunTransition(
      { status: 'success', action: 'local_agent.git_status' },
      { posted_status: 'success', result: {} },
      now,
    )
    expect(s.action).toBe('idempotent')

    const e = nextRunTransition(
      { status: 'error', action: 'local_agent.git_status' },
      { posted_status: 'success', result: {} },
      now,
    )
    expect(e.action).toBe('idempotent')
  })

  it('rejects destructive verbs even on the result path', () => {
    const t = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.write_file' },
      { posted_status: 'success', result: { wrote: true } },
      now,
    )
    expect(t.action).toBe('reject')
    if (t.action !== 'reject') return
    expect(t.reason).toMatch(/V0 only supports read-only/i)
  })

  it('rejects unknown current status', () => {
    const t = nextRunTransition(
      { status: 'blocked', action: 'local_agent.git_status' },
      { posted_status: 'success' },
      now,
    )
    expect(t.action).toBe('reject')
  })

  it('rejects invalid posted_status', () => {
    const t = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.git_status' },
      // @ts-expect-error — testing runtime guard
      { posted_status: 'wat' },
      now,
    )
    expect(t.action).toBe('reject')
  })

  it('defaults missing result/error fields', () => {
    const ok = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.git_status' },
      { posted_status: 'success' },
      now,
    )
    if (ok.action !== 'update') throw new Error('expected update')
    expect(ok.update.result).toEqual({})

    const bad = nextRunTransition(
      { status: 'pending_approval', action: 'local_agent.git_status' },
      { posted_status: 'error' },
      now,
    )
    if (bad.action !== 'update') throw new Error('expected update')
    expect(bad.update.error_message).toBe('unknown error')
  })
})
