import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Hoisted shared state (available inside the hoisted vi.mock factories) ──
const h = vi.hoisted(() => {
  const responseQueue: string[] = []
  const createMock = vi.fn(async () => ({
    content: [{ type: 'text', text: responseQueue.shift() ?? '{"tool_calls":[],"output":"fallback"}' }],
  }))
  const rawExecMock = vi.fn(async (..._a: unknown[]) => ({
    tool: 'github', action: 'listRepos', params: {},
    status: 'success' as const, result: { repos: ['o/r'] },
    duration_ms: 1, executed_at: '2026-06-01T00:00:00Z',
  }))
  return { responseQueue, createMock, rawExecMock }
})
const { createMock, rawExecMock } = h
function enqueue(json: object) { h.responseQueue.push(JSON.stringify(json)) }

vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: h.createMock } },
}))
vi.mock('@/lib/tools/router', () => ({
  describeTool: () => ({ actions: [{ name: 'listRepos', description: '', params: [] }] }),
  executeToolCall: (...a: unknown[]) => h.rawExecMock(...a),
}))

import { runAgentLoop } from '@/lib/ai/gateway'

// ── Recording supabase mock ──
interface Rec { inserts: Array<{ table: string; payload: Record<string, unknown> }> }
function makeClient(): { client: SupabaseClient; rec: Rec } {
  const rec: Rec = { inserts: [] }
  function builder(table: string) {
    let pending: Record<string, unknown> | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = () => b
    b.eq = () => b
    b.insert = (p: Record<string, unknown> | Record<string, unknown>[]) => {
      const first = Array.isArray(p) ? p[0] : p
      rec.inserts.push({ table, payload: first })
      pending = first
      return b
    }
    b.update = () => b
    b.single = () => Promise.resolve({ data: { id: `${table}-1`, ...(pending ?? {}) }, error: null })
    b.maybeSingle = () => Promise.resolve({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (resolve: any) => resolve({ data: [], error: null })
    return b
  }
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient, rec }
}

const agent = {
  id: 'a1', user_id: 'u1', type: 'agent', is_active: true,
  agent_type: 'engineering', name: 'Eng', description: '', style_prompt: '',
  system_prompt: '', tools_allowed: ['github'],
} as never
const task = { id: 't1', user_id: 'u1', title: 'do', description: '', project_id: 'p1' } as never

beforeEach(() => { h.responseQueue.length = 0; createMock.mockClear(); rawExecMock.mockClear() })

describe('runAgentLoop unified approval gate (P0-1/P0-2)', () => {
  it('HIGH-risk github.createPullRequest → NO execution, creates approval_request, pauses', async () => {
    enqueue({ reasoning_summary: 'open pr', tool_calls: [
      { tool: 'github', action: 'createPullRequest', params: { repo: 'o/r', branch: 'feat', base: 'main', title: 't', files: [] } },
    ] })
    const { client, rec } = makeClient()

    const result = await runAgentLoop({
      agent, task, projectContext: null, userId: 'u1', supabase: client,
      availableTools: ['github'], taskRunId: 'tr1', projectId: 'p1',
    })

    // Paused for approval
    expect(result.pending_approval).toBe(true)
    expect(result.pending_approvals?.[0].capability_action).toBe('github.pr.create')
    // The real tool was NEVER executed
    expect(rawExecMock).not.toHaveBeenCalled()
    // An approval_request was created (lands in Approval Inbox)
    expect(rec.inserts.some(i => i.table === 'approval_requests')).toBe(true)
    const appr = rec.inserts.find(i => i.table === 'approval_requests')!
    expect(appr.payload.status).toBe('pending')
    expect(appr.payload.action_type).toBe('tool.github.pr.create')
    expect(Number(appr.payload.risk_level)).toBeGreaterThanOrEqual(2)
    // A pending_approval tool_run was recorded
    expect(rec.inserts.some(i => i.table === 'tool_runs' && i.payload.status === 'pending_approval')).toBe(true)
  })

  it('LOW-risk github.listRepos → executes via the unified path, no approval', async () => {
    enqueue({ reasoning_summary: 'list', tool_calls: [{ tool: 'github', action: 'listRepos', params: {} }] })
    enqueue({ tool_calls: [], output: 'done', summary: 'ok' })   // final step
    const { client, rec } = makeClient()

    const result = await runAgentLoop({
      agent, task, projectContext: null, userId: 'u1', supabase: client,
      availableTools: ['github'], taskRunId: 'tr1', projectId: 'p1',
    })

    expect(result.pending_approval).toBeFalsy()
    expect(rawExecMock).toHaveBeenCalledTimes(1)               // real read executed
    expect(result.final_output).toBe('done')
    expect(rec.inserts.some(i => i.table === 'approval_requests')).toBe(false)
  })

  it('unknown tool action fails closed → approval, not execution', async () => {
    enqueue({ tool_calls: [{ tool: 'github', action: 'createRepo', params: { name: 'x' } }] })
    const { client, rec } = makeClient()
    const result = await runAgentLoop({
      agent, task, projectContext: null, userId: 'u1', supabase: client,
      availableTools: ['github'], taskRunId: 'tr1', projectId: 'p1',
    })
    expect(result.pending_approval).toBe(true)
    expect(rawExecMock).not.toHaveBeenCalled()
    expect(rec.inserts.some(i => i.table === 'approval_requests')).toBe(true)
  })
})
