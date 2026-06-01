import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { executeToolCall } from '@/lib/tools/router'

// ─────────────────────────────────────────────────
// V3.6 — One-click GitHub repo for a new project
// POST /api/projects/github-repo  Body: { name, private?, description?, project_id? }
//
// User-initiated provisioning (not autonomous agent work), so it runs the
// github tool directly via executeToolCall — which loads + decrypts the
// stored token and dispatches createRepo. Audited. Clear error if GitHub
// isn't connected yet.
// ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    name?: string; private?: boolean; description?: string; project_id?: string
  }
  const name = (body.name ?? '').trim()
  if (!name) return apiError('name required', { status: 400 })

  const result = await executeToolCall(
    { tool: 'github', action: 'createRepo', params: {
      name, private: body.private !== false, description: body.description ?? '',
    } },
    user.id, supabase,
  )

  if (result.status !== 'success') {
    // Most common cause: GitHub not connected. Surface it plainly.
    await audit(supabase, user.id, 'tool_call.executed', {
      resource_type: 'github.createRepo',
      metadata: { ok: false, name, error: result.error ?? 'unknown' },
    })
    return Response.json({
      ok: false,
      error: result.error ?? '建仓失败',
      hint: /未连接|未配置|connected/.test(result.error ?? '')
        ? '请先在 /tools 连接 GitHub（粘贴 Personal Access Token）'
        : undefined,
    }, { status: 400 })
  }

  await audit(supabase, user.id, 'tool_call.executed', {
    resource_type: 'github.createRepo',
    resource_id: body.project_id ?? null,
    metadata: { ok: true, repo: (result.result as { full_name?: string }).full_name ?? name },
  })

  return Response.json({ ok: true, ...result.result })
}
