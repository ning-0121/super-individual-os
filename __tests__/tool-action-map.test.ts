import { describe, it, expect } from 'vitest'
import { resolveCapabilityAction, isMappedAction } from '@/lib/tools/action-map'
import { classifyToolRisk } from '@/lib/tools/tool-autonomy'

// Proves the gate's classification basis: handler action → canonical capability
// → risk level. Read-only = low (auto), writes = L2+ (approval), unknown =
// fail-safe to L4.
describe('resolveCapabilityAction', () => {
  it('maps GitHub read actions to L0 capabilities', () => {
    expect(resolveCapabilityAction('github', 'listRepos')).toBe('github.repo.list')
    expect(resolveCapabilityAction('github', 'readFile')).toBe('github.file.read')
    expect(resolveCapabilityAction('github', 'getPullRequestDiff')).toBe('github.pr.diff')
  })
  it('maps GitHub write actions to their canonical capabilities', () => {
    expect(resolveCapabilityAction('github', 'createPullRequest')).toBe('github.pr.create')
    expect(resolveCapabilityAction('github', 'createOrUpdateFile')).toBe('github.file.write')
    expect(resolveCapabilityAction('github', 'mergePullRequest')).toBe('github.pr.merge')
  })
  it('maps vercel + supabase', () => {
    expect(resolveCapabilityAction('vercel', 'triggerProductionDeploy')).toBe('vercel.deploy.production')
    expect(resolveCapabilityAction('supabase', 'listTables')).toBe('supabase.schema.read')
  })
  it('FAIL-SAFE: unknown action → synthetic id that findCapability misses', () => {
    expect(resolveCapabilityAction('github', 'createRepo')).toBe('github.createRepo')
    expect(isMappedAction('github', 'createRepo')).toBe(false)
    expect(resolveCapabilityAction('evil', 'rmRf')).toBe('evil.rmRf')
  })
})

describe('classifyToolRisk via resolved capability', () => {
  it('read-only GitHub = risk 0/1, no approvers (auto-executes)', () => {
    const r = classifyToolRisk(resolveCapabilityAction('github', 'listRepos'), {})
    expect(r.risk_level).toBeLessThanOrEqual(1)
    expect(r.required_approvers.length).toBe(0)
  })
  it('createPullRequest = risk >= 2, needs approval', () => {
    const r = classifyToolRisk(resolveCapabilityAction('github', 'createPullRequest'), { branch: 'feat', base: 'main' })
    expect(r.risk_level).toBeGreaterThanOrEqual(2)
    expect(r.required_approvers.length).toBeGreaterThan(0)
  })
  it('write to main escalates to L4', () => {
    const r = classifyToolRisk(resolveCapabilityAction('github', 'createOrUpdateFile'), { branch: 'main' })
    expect(r.risk_level).toBe(4)
  })
  it('production deploy = L4', () => {
    const r = classifyToolRisk(resolveCapabilityAction('vercel', 'triggerProductionDeploy'), {})
    expect(r.risk_level).toBe(4)
  })
  it('UNKNOWN action fails closed to L4 (CEO approval)', () => {
    const r = classifyToolRisk(resolveCapabilityAction('github', 'createRepo'), {})
    expect(r.risk_level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })
})
