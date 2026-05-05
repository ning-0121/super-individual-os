import type { PolicyRule, ManagerRole } from '@/types'

// ─────────────────────────────────────────────────
// V2.1+ — Default execution policies, seeded per user.
// Higher priority wins. First match (priority desc) applies.
// ─────────────────────────────────────────────────

export interface DefaultPolicyDef {
  policy_name: string
  priority: number
  rule: PolicyRule
}

export const DEFAULT_POLICIES: DefaultPolicyDef[] = [
  // ═══════════════════════════════════════════════════════
  // L4 critical — always CEO
  // ═══════════════════════════════════════════════════════
  {
    policy_name: 'critical_actions_require_ceo',
    priority: 100,
    rule: {
      match: { risk_level_min: 4 },
      action: 'human_required',
      require_ceo: true,
      reason: 'L4 critical actions always need CEO confirmation',
    },
  },
  {
    policy_name: 'vercel_deploy_production',
    priority: 99,
    rule: {
      match: { action_type_pattern: '^tool\\.vercel\\.deployProduction' },
      action: 'human_required',
      require_ceo: true,
      reason: 'Production deploy requires CEO sign-off',
    },
  },
  {
    policy_name: 'supabase_apply_migration',
    priority: 98,
    rule: {
      match: { action_type_pattern: '^tool\\.supabase\\.applyMigration' },
      action: 'human_required',
      require_ceo: true,
      reason: 'Applying migration to live DB requires CEO',
    },
  },

  // ═══════════════════════════════════════════════════════
  // L3 — AI manager + QA must both approve
  // ═══════════════════════════════════════════════════════
  {
    policy_name: 'supabase_migration_create',
    priority: 80,
    rule: {
      match: { action_type_pattern: '^tool\\.supabase\\.createMigrationFile' },
      action: 'ai_manager',
      ai_manager_roles_required: ['engineering_manager' as ManagerRole, 'qa_manager' as ManagerRole],
      require_qa: true,
      reason: 'Migration draft needs technical + QA review',
    },
  },
  {
    policy_name: 'l3_high_impact_via_qa',
    priority: 78,
    rule: {
      match: { risk_level_min: 3, risk_level_max: 3 },
      action: 'ai_manager',
      ai_manager_roles_required: ['qa_manager' as ManagerRole],
      require_qa: true,
      reason: 'L3 high-impact action — QA review required',
    },
  },

  // ═══════════════════════════════════════════════════════
  // L2 — AI manager (with QA when applicable)
  // ═══════════════════════════════════════════════════════
  {
    policy_name: 'github_pr_create',
    priority: 70,
    rule: {
      match: { action_type_pattern: '^tool\\.github\\.createPullRequest' },
      action: 'ai_manager',
      ai_manager_roles_required: ['engineering_manager' as ManagerRole, 'qa_manager' as ManagerRole],
      require_qa: true,
      reason: 'GitHub PR — CTO + QA must both approve',
    },
  },
  {
    policy_name: 'vercel_deploy_preview',
    priority: 68,
    rule: {
      match: { action_type_pattern: '^tool\\.vercel\\.deployPreview' },
      action: 'ai_manager',
      ai_manager_roles_required: ['engineering_manager' as ManagerRole, 'qa_manager' as ManagerRole],
      require_qa: true,
      reason: 'Preview deploy — CTO + QA review',
    },
  },
  {
    policy_name: 'engineering_task_run',
    priority: 65,
    rule: {
      match: {
        action_type_pattern: '^task\\.run',
        agent_types: ['engineering', 'devops'],
        tools_required_any: ['github', 'vercel'],
        risk_level_max: 2,
      },
      action: 'ai_manager',
      ai_manager_role: 'engineering_manager' as ManagerRole,
      reason: 'Engineering task with risky tools — CTO decides',
    },
  },

  // ═══════════════════════════════════════════════════════
  // L1/L2 auto — safe / reversible
  // ═══════════════════════════════════════════════════════
  {
    policy_name: 'github_issue_create',
    priority: 55,
    rule: {
      match: { action_type_pattern: '^tool\\.github\\.createIssue' },
      action: 'auto_approve',
      reason: 'Issues are reversible / non-destructive',
    },
  },
  {
    policy_name: 'supabase_validate_sql',
    priority: 54,
    rule: {
      match: { action_type_pattern: '^tool\\.supabase\\.validateSql' },
      action: 'auto_approve',
      reason: 'SQL validation is static analysis only',
    },
  },
  {
    policy_name: 'low_risk_auto',
    priority: 50,
    rule: {
      match: { risk_level_max: 1 },
      action: 'auto_approve',
      reason: 'L0/L1 actions are auto-approved',
    },
  },
  {
    policy_name: 'knowledge_agent_task_run',
    priority: 48,
    rule: {
      match: {
        action_type_pattern: '^task\\.run',
        agent_types: ['research', 'qa', 'strategic', 'product', 'finance', 'design', 'legal'],
      },
      action: 'auto_approve',
      reason: 'Knowledge / planning agents have no external side-effects',
    },
  },

  // ═══════════════════════════════════════════════════════
  // Default fallthrough
  // ═══════════════════════════════════════════════════════
  {
    policy_name: 'default_human_required',
    priority: 0,
    rule: {
      match: {},
      action: 'human_required',
      reason: 'No specific policy matched — defer to human',
    },
  },
]
