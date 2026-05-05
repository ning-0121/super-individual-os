import type { PolicyRule, ManagerRole } from '@/types'

// ─────────────────────────────────────────────────
// V2.1 — Default execution policies, seeded per user
// Higher priority wins. First match in priority-desc order applies.
// ─────────────────────────────────────────────────

export interface DefaultPolicyDef {
  policy_name: string
  priority: number
  rule: PolicyRule
}

export const DEFAULT_POLICIES: DefaultPolicyDef[] = [
  // ── Block bucket — never auto, never AI manager ─────────────────
  {
    policy_name: 'critical_actions_require_ceo',
    priority: 100,
    rule: {
      match: { risk_level_min: 4 },
      action: 'human_required',
      reason: 'L4 critical actions always need CEO confirmation',
    },
  },
  // (slot reserved for project-level cost guards — add via /api/policies)

  // ── AI manager bucket — autonomous decisions for L2/L3 ──────────
  {
    policy_name: 'github_pr_via_engineering_manager',
    priority: 80,
    rule: {
      match: {
        action_type_pattern: '^tool\\.github\\.createPullRequest',
        risk_level_max: 2,
      },
      action: 'ai_manager',
      ai_manager_role: 'engineering_manager' as ManagerRole,
      reason: 'GitHub PR auto-decided by engineering manager',
    },
  },
  {
    policy_name: 'github_issue_via_engineering_manager',
    priority: 78,
    rule: {
      match: {
        action_type_pattern: '^tool\\.github\\.createIssue',
        risk_level_max: 2,
      },
      action: 'ai_manager',
      ai_manager_role: 'engineering_manager' as ManagerRole,
      reason: 'GitHub Issue auto-decided by engineering manager',
    },
  },
  {
    policy_name: 'engineering_task_run_via_engineering_manager',
    priority: 75,
    rule: {
      match: {
        action_type_pattern: '^task\\.run',
        agent_types: ['engineering', 'devops'],
        tools_required_any: ['github', 'vercel'],
        risk_level_max: 2,
      },
      action: 'ai_manager',
      ai_manager_role: 'engineering_manager' as ManagerRole,
      reason: 'Engineering task with risky tools — engineering manager decides',
    },
  },
  {
    policy_name: 'l3_high_impact_via_qa_manager',
    priority: 70,
    rule: {
      match: { risk_level_min: 3, risk_level_max: 3 },
      action: 'ai_manager',
      ai_manager_role: 'qa_manager' as ManagerRole,
      reason: 'L3 high-impact action — QA manager + secondary approver',
    },
  },

  // ── Auto bucket — pure low-risk ────────────────────────────────
  {
    policy_name: 'low_risk_auto',
    priority: 50,
    rule: {
      match: { risk_level_max: 1 },
      action: 'auto_approve',
      reason: 'L0/L1 actions are auto-approved (read-only or text-only)',
    },
  },
  {
    policy_name: 'research_qa_strategic_auto',
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

  // ── Default fall-through ───────────────────────────────────────
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
