import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/observability'
import { generateManagerReport } from '@/services/manager-reports'
import { audit } from '@/lib/audit'
import type { ManagerReportType } from '@/types'

const TYPES: ManagerReportType[] = ['daily', 'weekly', 'project', 'risk', 'growth', 'execution']
const ROLES = [
  'ceo', 'engineering_manager', 'qa_manager', 'design_manager',
  'growth_manager', 'finance_manager', 'risk_manager',
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    role?: string
    report_type?: ManagerReportType
    project_id?: string
    system_id?: string
    execution_unit_id?: string
    // Generate one report per role when set
    all_roles?: boolean
  }

  if (!body.report_type || !TYPES.includes(body.report_type)) {
    return apiError('report_type required (daily|weekly|project|risk|growth|execution)', { status: 400 })
  }

  // Resolve roles to generate
  let roles: string[]
  if (body.all_roles) {
    roles = ROLES
  } else {
    if (!body.role || !ROLES.includes(body.role)) {
      return apiError('role required, or pass all_roles: true', { status: 400 })
    }
    roles = [body.role]
  }

  const reports = []
  for (const role of roles) {
    const rep = await generateManagerReport(supabase, user.id, {
      role,
      report_type: body.report_type,
      project_id: body.project_id,
      system_id: body.system_id,
      execution_unit_id: body.execution_unit_id,
    })
    if (rep) reports.push(rep)
  }

  await audit(supabase, user.id, 'manager_report.generated' as never, {
    resource_type: 'manager_report',
    metadata: { roles, report_type: body.report_type, count: reports.length },
  } as never)

  return Response.json({ ok: true, count: reports.length, reports })
}
