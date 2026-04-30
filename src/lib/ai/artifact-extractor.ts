import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionUnit, ArtifactType, AgentType } from '@/types'
import type { ToolResult } from '@/lib/tools/types'

interface ExtractParams {
  supabase: SupabaseClient
  userId: string
  taskRunId: string
  taskId: string
  projectId: string | null
  agent: ExecutionUnit
  finalOutput: string
  summary: string
  toolCalls: ToolResult[]
}

interface ArtifactInsert {
  artifact_type: ArtifactType
  title: string
  url: string
  content: string
  metadata: Record<string, unknown>
}

// Map agent_type → default artifact type for the markdown deliverable
const DEFAULT_TYPE_BY_AGENT: Record<string, ArtifactType> = {
  product:     'markdown_doc',
  engineering: 'markdown_doc',
  research:    'research_report',
  growth:      'markdown_doc',
  finance:     'markdown_doc',
  legal:       'markdown_doc',
  design:      'design_spec',
  '3d_avatar': 'design_spec',
  qa:          'markdown_doc',
  devops:      'markdown_doc',
  strategic:   'markdown_doc',
  general:     'markdown_doc',
}

export async function extractAndSaveArtifacts(params: ExtractParams): Promise<number> {
  const { supabase, userId, taskRunId, taskId, projectId, agent, finalOutput, summary, toolCalls } = params

  const artifacts: ArtifactInsert[] = []

  // 1. Extract from successful tool_calls
  for (const tc of toolCalls) {
    if (tc.status !== 'success') continue
    const r = (tc.result ?? {}) as {
      pr_url?: string; pr_number?: number; branch?: string;
      issue_url?: string; issue_number?: number;
      files_written?: string[]; repo?: string;
    }
    const params = (tc.params ?? {}) as { title?: string; body?: string; repo?: string }

    // GitHub PR
    if (tc.tool === 'github' && tc.action === 'createPullRequest' && r.pr_url) {
      artifacts.push({
        artifact_type: 'code_pr',
        title: params.title ? `PR #${r.pr_number}: ${params.title}` : `PR #${r.pr_number}`,
        url: r.pr_url,
        content: params.body ?? '',
        metadata: {
          pr_number: r.pr_number,
          branch: r.branch,
          files_written: r.files_written ?? [],
          repo: r.repo ?? params.repo,
          source: 'github.createPullRequest',
        },
      })
    }

    // GitHub Issue
    if (tc.tool === 'github' && tc.action === 'createIssue' && r.issue_url) {
      artifacts.push({
        artifact_type: 'issue',
        title: params.title ? `Issue #${r.issue_number}: ${params.title}` : `Issue #${r.issue_number}`,
        url: r.issue_url,
        content: params.body ?? '',
        metadata: {
          issue_number: r.issue_number,
          repo: r.repo ?? params.repo,
          source: 'github.createIssue',
        },
      })
    }
  }

  // 2. Final output as markdown / spec / report
  if (finalOutput && finalOutput.trim().length >= 100) {
    const agentType = (agent.agent_type ?? 'general') as AgentType
    const defaultType = DEFAULT_TYPE_BY_AGENT[agentType] ?? 'markdown_doc'

    // Use summary as title fallback
    const title = summary
      ? (summary.length > 80 ? summary.slice(0, 80) + '…' : summary)
      : `${agent.name} 交付物`

    artifacts.push({
      artifact_type: defaultType,
      title,
      url: '',
      content: finalOutput,
      metadata: {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_type: agentType,
        char_count: finalOutput.length,
        source: 'agent_final_output',
      },
    })
  }

  if (artifacts.length === 0) return 0

  const rows = artifacts.map(a => ({
    ...a,
    user_id: userId,
    task_run_id: taskRunId,
    task_id: taskId,
    project_id: projectId,
  }))

  const { error } = await supabase.from('artifacts').insert(rows)
  if (error) {
    console.error('[artifacts.insert] error:', error.message)
    return 0
  }

  return artifacts.length
}
