import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { audit } from '@/lib/audit'
import { resolveAllRequiredRoles } from '@/services/managers'
import { RISK_ORDER, type RiskLabel } from '@/lib/approvals/risk'

// POST /api/approval-requests/bulk
// Body modes:
//   { mode: 'approve', ids: [...] }                       → approve specific ids
//   { mode: 'reject', ids: [...] }                        → reject specific ids
//   { mode: 'approve_all_at_or_below', risk_label: 'low' }→ approve every pending with risk ≤ label
//   { mode: 'reject_all_at_or_above',  risk_label: 'high' }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    mode?: 'approve' | 'reject' | 'approve_all_at_or_below' | 'reject_all_at_or_above'
    ids?: string[]
    risk_label?: RiskLabel
    reason?: string
  }

  if (!body.mode) return apiError('mode required', { status: 400 })

  // Resolve target ids
  let ids: string[] = body.ids ?? []

  if (body.mode === 'approve_all_at_or_below' || body.mode === 'reject_all_at_or_above') {
    if (!body.risk_label) return apiError('risk_label required for this mode', { status: 400 })
    const { data: rows } = await supabase.from('approval_requests')
      .select('id, risk_label').eq('user_id', user.id).eq('status', 'pending')
    const threshold = RISK_ORDER[body.risk_label]
    const filtered = (rows ?? []).filter(r => {
      const lvl = RISK_ORDER[(r.risk_label as RiskLabel) ?? 'low']
      return body.mode === 'approve_all_at_or_below' ? lvl <= threshold : lvl >= threshold
    })
    ids = filtered.map(r => r.id as string)
  }

  if (ids.length === 0) {
    return Response.json({ ok: true, processed: 0, results: [] })
  }

  const decision = (body.mode === 'reject' || body.mode === 'reject_all_at_or_above')
    ? 'rejected' as const : 'approved' as const

  const results: Array<{ id: string; ok: boolean; status?: string; error?: string }> = []
  for (const id of ids) {
    const r = await resolveAllRequiredRoles(supabase, {
      userId: user.id,
      requestId: id,
      decision,
      reason: body.reason ?? `bulk_${body.mode}`,
    })
    results.push({
      id, ok: !!r.ok,
      status: r.status,
      error: r.ok ? undefined : r.error,
    })
  }

  await audit(supabase, user.id, 'approval.bulk_resolved' as never, {
    resource_type: 'approval_request',
    metadata: { mode: body.mode, count: ids.length, decision, results },
  } as never)

  const successCount = results.filter(r => r.ok).length
  return Response.json({
    ok: true, processed: ids.length, succeeded: successCount, results,
  })
}
