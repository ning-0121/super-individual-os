// ─────────────────────────────────────────────────
// V2.2 — Tool capability registry (pure, in-memory mirror of seed)
// Used by the tool router to classify risk + required approvers
// without a DB round-trip on every call.
// ─────────────────────────────────────────────────

import type { ManagerRole, RiskLevel } from '@/types'

export interface ToolCapability {
  tool: 'github' | 'vercel' | 'supabase' | 'local_agent'
  action: string                  // canonical e.g. 'github.pr.create'
  short_action: string            // e.g. 'pr.create'
  risk_level: RiskLevel
  manager_role?: ManagerRole
  require_qa: boolean
  require_ceo: boolean
  description: string
}

export const TOOL_CAPABILITIES: ReadonlyArray<ToolCapability> = [
  // GitHub
  { tool: 'github', action: 'github.repo.list',     short_action: 'repo.list',     risk_level: 0, require_qa: false, require_ceo: false, description: 'List accessible repositories' },
  { tool: 'github', action: 'github.file.read',     short_action: 'file.read',     risk_level: 0, require_qa: false, require_ceo: false, description: 'Read file from repo' },
  { tool: 'github', action: 'github.branch.list',   short_action: 'branch.list',   risk_level: 0, require_qa: false, require_ceo: false, description: 'List branches' },
  { tool: 'github', action: 'github.pr.diff',       short_action: 'pr.diff',       risk_level: 0, require_qa: false, require_ceo: false, description: 'Read PR diff' },
  { tool: 'github', action: 'github.branch.create', short_action: 'branch.create', risk_level: 1, require_qa: false, require_ceo: false, description: 'Create new branch' },
  { tool: 'github', action: 'github.issue.create',  short_action: 'issue.create',  risk_level: 1, require_qa: false, require_ceo: false, description: 'Create issue' },
  { tool: 'github', action: 'github.pr.comment',    short_action: 'pr.comment',    risk_level: 1, require_qa: false, require_ceo: false, description: 'Comment on PR' },
  { tool: 'github', action: 'github.file.write',    short_action: 'file.write',    risk_level: 2, manager_role: 'engineering_manager', require_qa: true,  require_ceo: false, description: 'Write file via PR; main branch forbidden' },
  { tool: 'github', action: 'github.pr.create',     short_action: 'pr.create',     risk_level: 2, manager_role: 'engineering_manager', require_qa: true,  require_ceo: false, description: 'Open pull request — CTO + QA must both approve' },
  { tool: 'github', action: 'github.pr.merge',      short_action: 'pr.merge',      risk_level: 4, require_qa: false, require_ceo: true,  description: 'Merge pull request — CEO only' },

  // Vercel
  { tool: 'vercel', action: 'vercel.project.list',       short_action: 'project.list',      risk_level: 0, require_qa: false, require_ceo: false, description: 'List Vercel projects' },
  { tool: 'vercel', action: 'vercel.deployment.list',    short_action: 'deployment.list',   risk_level: 0, require_qa: false, require_ceo: false, description: 'List recent deployments' },
  { tool: 'vercel', action: 'vercel.deployment.status',  short_action: 'deployment.status', risk_level: 0, require_qa: false, require_ceo: false, description: 'Read deployment status' },
  { tool: 'vercel', action: 'vercel.deploy.preview',     short_action: 'deploy.preview',    risk_level: 2, manager_role: 'engineering_manager', require_qa: true,  require_ceo: false, description: 'Trigger preview deploy' },
  { tool: 'vercel', action: 'vercel.deploy.production',  short_action: 'deploy.production', risk_level: 4, require_qa: false, require_ceo: true,  description: 'Trigger production deploy — CEO only' },
  { tool: 'vercel', action: 'vercel.env.update',         short_action: 'env.update',        risk_level: 4, require_qa: false, require_ceo: true,  description: 'Modify env vars — CEO only' },

  // Supabase
  { tool: 'supabase', action: 'supabase.schema.read',                short_action: 'schema.read',                risk_level: 0, require_qa: false, require_ceo: false, description: 'Read schema metadata' },
  { tool: 'supabase', action: 'supabase.sql.validate',               short_action: 'sql.validate',               risk_level: 1, require_qa: false, require_ceo: false, description: 'Static SQL safety check' },
  { tool: 'supabase', action: 'supabase.migration.create',           short_action: 'migration.create',           risk_level: 2, manager_role: 'engineering_manager', require_qa: true,  require_ceo: false, description: 'Create migration file (forward)' },
  { tool: 'supabase', action: 'supabase.migration.verify',           short_action: 'migration.verify',           risk_level: 2, manager_role: 'qa_manager',          require_qa: false, require_ceo: false, description: 'Verify migration applied correctly' },
  { tool: 'supabase', action: 'supabase.migration.apply_staging',    short_action: 'migration.apply_staging',    risk_level: 3, manager_role: 'engineering_manager', require_qa: true,  require_ceo: false, description: 'Apply migration to staging' },
  { tool: 'supabase', action: 'supabase.migration.apply_production', short_action: 'migration.apply_production', risk_level: 4, require_qa: false, require_ceo: true,  description: 'Apply migration to production — CEO only' },
  { tool: 'supabase', action: 'supabase.destructive_sql',            short_action: 'destructive_sql',            risk_level: 4, require_qa: false, require_ceo: true,  description: 'Any destructive SQL pattern — CEO only' },

  // Local Agent
  { tool: 'local_agent', action: 'local_agent.status',         short_action: 'status',        risk_level: 0, require_qa: false, require_ceo: false, description: 'Local agent health' },
  { tool: 'local_agent', action: 'local_agent.repo.read',      short_action: 'repo.read',     risk_level: 1, require_qa: false, require_ceo: false, description: 'Read local file' },
  { tool: 'local_agent', action: 'local_agent.command.run',    short_action: 'command.run',   risk_level: 3, manager_role: 'engineering_manager', require_qa: true, require_ceo: false, description: 'Run shell command' },
  { tool: 'local_agent', action: 'local_agent.cursor.invoke',  short_action: 'cursor.invoke', risk_level: 3, manager_role: 'engineering_manager', require_qa: true, require_ceo: false, description: 'Invoke Cursor edit' },
] as const

export function findCapability(action: string): ToolCapability | null {
  return TOOL_CAPABILITIES.find(c => c.action === action) ?? null
}

export function listCapabilitiesForTool(tool: string): ToolCapability[] {
  return TOOL_CAPABILITIES.filter(c => c.tool === tool)
}

// Compute the required approver list given a capability + override flags
// (e.g. destructive SQL detected at runtime upgrades supabase.migration.create → require_ceo).
export function requiredApproversFor(cap: ToolCapability): ManagerRole[] {
  const roles: ManagerRole[] = []
  if (cap.manager_role) roles.push(cap.manager_role)
  if (cap.require_qa && !roles.includes('qa_manager')) roles.push('qa_manager')
  if (cap.require_ceo) roles.push('ceo')
  return roles
}
