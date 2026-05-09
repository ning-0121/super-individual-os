import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { listManagerReports } from '@/services/manager-reports'
import type { ManagerReportType } from '@/types'

const TYPES: ManagerReportType[] = ['daily', 'weekly', 'project', 'risk', 'growth', 'execution']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const role        = searchParams.get('role')        ?? undefined
  const report_type = searchParams.get('report_type') as ManagerReportType | null
  const only_blocked = searchParams.get('only_blocked') === '1'
  const limit       = Number(searchParams.get('limit') ?? 20)

  const reports = await listManagerReports(supabase, user.id, {
    role,
    report_type: report_type && TYPES.includes(report_type) ? report_type : undefined,
    only_blocked,
    limit,
  })
  return Response.json({ reports })
}
