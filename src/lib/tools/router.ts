import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolCall, ToolResult, ToolHandler, ToolActionDescription } from './types'
import { githubTool } from './github'

// ─────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────
export const TOOL_REGISTRY: Record<string, ToolHandler> = {
  github: githubTool,
  // future: supabase, vercel, figma, notion, ...
}

export function listRegisteredTools(): string[] {
  return Object.keys(TOOL_REGISTRY)
}

export function describeTool(name: string): { actions: ToolActionDescription[] } | null {
  return TOOL_REGISTRY[name]?.describe() ?? null
}

// ─────────────────────────────────────────────────
// Execute a single tool call against the user's stored config
// ─────────────────────────────────────────────────
export async function executeToolCall(
  call: ToolCall,
  userId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const start = Date.now()
  const executed_at = new Date().toISOString()

  try {
    const handler = TOOL_REGISTRY[call.tool]
    if (!handler) throw new Error(`未注册的工具：${call.tool}`)

    // Load user's connected integration
    const { data: integration, error } = await supabase
      .from('tool_integrations')
      .select('config, auth_status, is_active')
      .eq('user_id', userId)
      .eq('tool_name', call.tool)
      .maybeSingle()

    if (error) throw new Error(`读取工具配置失败：${error.message}`)
    if (!integration) throw new Error(`工具 ${call.tool} 尚未连接，请先在 /tools 配置`)
    if (integration.auth_status !== 'connected') throw new Error(`工具 ${call.tool} 未处于 connected 状态`)
    if (!integration.is_active) throw new Error(`工具 ${call.tool} 已停用`)

    const result = await handler.execute(call.action, call.params, integration.config ?? {})

    return {
      tool: call.tool,
      action: call.action,
      params: call.params,
      status: 'success',
      result: (result ?? {}) as Record<string, unknown>,
      duration_ms: Date.now() - start,
      executed_at,
    }
  } catch (e) {
    return {
      tool: call.tool,
      action: call.action,
      params: call.params,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      duration_ms: Date.now() - start,
      executed_at,
    }
  }
}

// ─────────────────────────────────────────────────
// Helpers used by the run pipeline
// ─────────────────────────────────────────────────
export async function getUserConnectedTools(
  userId: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data } = await supabase
    .from('tool_integrations')
    .select('tool_name')
    .eq('user_id', userId)
    .eq('auth_status', 'connected')
    .eq('is_active', true)
  return (data ?? []).map(r => r.tool_name as string)
}
