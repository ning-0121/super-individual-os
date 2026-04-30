import { describe, it, expect } from 'vitest'
import { extractAndSaveArtifacts } from '@/lib/ai/artifact-extractor'
import type { ExecutionUnit } from '@/types'
import type { ToolResult } from '@/lib/tools/types'

interface MockSupabase {
  client: { from: (table: string) => { insert: (rows: unknown) => Promise<{ error: null }> } }
  inserts: Array<Record<string, unknown>>
}

function mockSupabase(): MockSupabase {
  const inserts: Array<Record<string, unknown>> = []
  return {
    client: {
      from() {
        return {
          insert: async (rows: unknown) => {
            const arr = Array.isArray(rows) ? rows : [rows]
            inserts.push(...(arr as Array<Record<string, unknown>>))
            return { error: null }
          },
        }
      },
    },
    inserts,
  }
}

const eng: ExecutionUnit = {
  id: 'a1', user_id: 'u1', name: 'Engineering', avatar: '💻',
  type: 'agent', agent_type: 'engineering', role: 'executor',
  description: '', capabilities: [], style_prompt: '', system_prompt: '',
  tools_allowed: ['github'], is_active: true, created_at: '',
}

const designer: ExecutionUnit = { ...eng, id: 'a2', name: 'Designer', agent_type: 'design' }
const researcher: ExecutionUnit = { ...eng, id: 'a3', name: 'Researcher', agent_type: 'research' }

describe('artifact-extractor', () => {
  it('extracts code_pr from successful github PR call + markdown_doc from output', async () => {
    const { client, inserts } = mockSupabase()
    const toolCalls: ToolResult[] = [{
      tool: 'github', action: 'createPullRequest',
      status: 'success',
      params: { title: 'Add X', body: 'desc' },
      result: { pr_url: 'https://github.com/u/r/pull/42', pr_number: 42, branch: 'feat/x', files_written: ['src/x.ts'], repo: 'u/r' },
      duration_ms: 200, executed_at: new Date().toISOString(),
    }]
    const count = await extractAndSaveArtifacts({
      supabase: client as never, userId: 'u1', taskRunId: 'r1', taskId: 't1', projectId: 'p1',
      agent: eng, finalOutput: 'x'.repeat(200), summary: 'Implemented X',
      toolCalls,
    })
    expect(count).toBe(2)
    const pr = inserts.find(a => a.artifact_type === 'code_pr')
    expect(pr).toBeDefined()
    expect(pr!.url).toBe('https://github.com/u/r/pull/42')
    expect((pr!.metadata as { pr_number: number }).pr_number).toBe(42)
    expect(inserts.find(a => a.artifact_type === 'markdown_doc')).toBeDefined()
  })

  it('classifies design agent output as design_spec', async () => {
    const { client, inserts } = mockSupabase()
    await extractAndSaveArtifacts({
      supabase: client as never, userId: 'u1', taskRunId: 'r1', taskId: 't1', projectId: 'p1',
      agent: designer, finalOutput: 'x'.repeat(200), summary: 'Designed page', toolCalls: [],
    })
    expect(inserts[0].artifact_type).toBe('design_spec')
  })

  it('classifies research agent output as research_report', async () => {
    const { client, inserts } = mockSupabase()
    await extractAndSaveArtifacts({
      supabase: client as never, userId: 'u1', taskRunId: 'r1', taskId: 't1', projectId: 'p1',
      agent: researcher, finalOutput: 'x'.repeat(200), summary: 'Market scan', toolCalls: [],
    })
    expect(inserts[0].artifact_type).toBe('research_report')
  })

  it('skips when output too short and no successful tools', async () => {
    const { client } = mockSupabase()
    const count = await extractAndSaveArtifacts({
      supabase: client as never, userId: 'u1', taskRunId: 'r1', taskId: 't1', projectId: 'p1',
      agent: eng, finalOutput: 'short', summary: '', toolCalls: [],
    })
    expect(count).toBe(0)
  })

  it('ignores failed tool calls', async () => {
    const { client, inserts } = mockSupabase()
    const failed: ToolResult[] = [{
      tool: 'github', action: 'createPullRequest', status: 'error',
      params: {}, error: 'auth failed',
      duration_ms: 50, executed_at: new Date().toISOString(),
    }]
    await extractAndSaveArtifacts({
      supabase: client as never, userId: 'u1', taskRunId: 'r1', taskId: 't1', projectId: 'p1',
      agent: eng, finalOutput: 'x'.repeat(200), summary: 'Tried', toolCalls: failed,
    })
    expect(inserts.find(a => a.artifact_type === 'code_pr')).toBeUndefined()
  })
})
