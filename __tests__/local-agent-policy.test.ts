import { describe, it, expect } from 'vitest'
import {
  classifyLocalAgentAction,
  isReadOnlyAction,
  listReadOnlyActions,
  listDestructiveActions,
  deriveAgentStatus,
  LOCAL_AGENT_READ_ONLY,
  LOCAL_AGENT_DESTRUCTIVE,
  ONLINE_WINDOW_MS,
} from '@/lib/local-agent/policy'

describe('classifyLocalAgentAction — V0 read-only whitelist', () => {
  it('allows every read-only action', () => {
    for (const def of LOCAL_AGENT_READ_ONLY) {
      const v = classifyLocalAgentAction(def.action)
      expect(v.allowed).toBe(true)
      expect(v.category).toBe('read')
      expect(v.matched_def?.action).toBe(def.action)
    }
  })

  it('rejects every destructive action with the V0 reason', () => {
    for (const def of LOCAL_AGENT_DESTRUCTIVE) {
      const v = classifyLocalAgentAction(def.action)
      expect(v.allowed).toBe(false)
      expect(v.category).toBe('destructive')
      expect(v.reason).toMatch(/V0 only supports read-only/i)
      expect(v.matched_def?.action).toBe(def.action)
    }
  })

  it('fails closed on unknown verbs', () => {
    const v = classifyLocalAgentAction('frobnicate_universe')
    expect(v.allowed).toBe(false)
    expect(v.category).toBe('unknown')
    expect(v.reason).toMatch(/V0 only supports read-only/i)
  })

  it('rejects empty / missing input', () => {
    expect(classifyLocalAgentAction('').allowed).toBe(false)
    expect(classifyLocalAgentAction('   ').allowed).toBe(false)
  })

  it('is case-insensitive and trims', () => {
    expect(classifyLocalAgentAction('  GIT_STATUS  ').allowed).toBe(true)
    expect(classifyLocalAgentAction('Write_File').allowed).toBe(false)
  })

  it('isReadOnlyAction mirrors classify', () => {
    expect(isReadOnlyAction('git_status')).toBe(true)
    expect(isReadOnlyAction('run_shell')).toBe(false)
    expect(isReadOnlyAction('nope')).toBe(false)
  })

  it('lists are non-empty and disjoint', () => {
    const ro = new Set(listReadOnlyActions())
    const de = new Set(listDestructiveActions())
    expect(ro.size).toBeGreaterThan(0)
    expect(de.size).toBeGreaterThan(0)
    for (const a of ro) expect(de.has(a)).toBe(false)
  })
})

describe('deriveAgentStatus — heartbeat freshness', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const fresh = new Date(now.getTime() - 60_000).toISOString()       // 1min ago
  const stale = new Date(now.getTime() - 10 * 60_000).toISOString()  // 10min ago
  const future = new Date(now.getTime() + 60_000).toISOString()

  it('returns "error" when session.status is error', () => {
    expect(deriveAgentStatus({ status: 'error', last_heartbeat: fresh }, now)).toBe('error')
  })

  it('returns "offline" for revoked / disconnected', () => {
    expect(deriveAgentStatus({ status: 'revoked', last_heartbeat: fresh }, now)).toBe('offline')
    expect(deriveAgentStatus({ status: 'disconnected', last_heartbeat: fresh }, now)).toBe('offline')
  })

  it('returns "online" when active + heartbeat within 5min', () => {
    expect(deriveAgentStatus({ status: 'active', last_heartbeat: fresh }, now)).toBe('online')
    expect(deriveAgentStatus({ status: 'registered', last_heartbeat: fresh }, now)).toBe('online')
  })

  it('returns "offline" when heartbeat is stale', () => {
    expect(deriveAgentStatus({ status: 'active', last_heartbeat: stale }, now)).toBe('offline')
  })

  it('idle > 2min counts as offline even within 5min window', () => {
    const idle3min = new Date(now.getTime() - 3 * 60_000).toISOString()
    expect(deriveAgentStatus({ status: 'idle', last_heartbeat: idle3min }, now)).toBe('offline')
  })

  it('idle <= 2min still online', () => {
    const idle1min = new Date(now.getTime() - 60_000).toISOString()
    expect(deriveAgentStatus({ status: 'idle', last_heartbeat: idle1min }, now)).toBe('online')
  })

  it('null / bogus / future heartbeat → offline', () => {
    expect(deriveAgentStatus({ status: 'active', last_heartbeat: null }, now)).toBe('offline')
    expect(deriveAgentStatus({ status: 'active', last_heartbeat: 'not-a-date' }, now)).toBe('offline')
    expect(deriveAgentStatus({ status: 'active', last_heartbeat: future }, now)).toBe('offline')
  })

  it('ONLINE_WINDOW_MS is 5 minutes', () => {
    expect(ONLINE_WINDOW_MS).toBe(5 * 60 * 1000)
  })
})
