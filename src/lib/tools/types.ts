// ─────────────────────────────────────────────────
// Tool Layer — shared types
// ─────────────────────────────────────────────────

// What an agent declares in its output
export interface ToolCall {
  tool: string                              // e.g. 'github'
  action: string                            // e.g. 'createPullRequest'
  params: Record<string, unknown>
}

// Result attached to task_runs.tool_calls after execution
export interface ToolResult {
  tool: string
  action: string
  params: Record<string, unknown>
  status: 'success' | 'error'
  result?: Record<string, unknown>          // present on success
  error?: string                            // present on error
  duration_ms: number
  executed_at: string
}

export interface ToolActionDescription {
  name: string
  description: string
  params: string[]
  example?: Record<string, unknown>
}

export interface ToolHandler {
  describe(): { actions: ToolActionDescription[] }
  execute(
    action: string,
    params: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Promise<unknown>
  validateConfig?(config: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>
}

// Maximum tool calls per agent run (safety cap)
export const MAX_TOOL_CALLS_PER_RUN = 5
