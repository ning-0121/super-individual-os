// ─────────────────────────────────────────────────
// V2.9 — Workflow Templates Library (pure, in-code seed)
// 5 system templates the user can fork into their project.
// Each template lives as readonly TS data so it can be type-checked,
// versioned in git, and tested without DB.
// ─────────────────────────────────────────────────

export type ExecutionUnitType = 'human' | 'ai' | 'agent'
export type StepType = 'task' | 'approval' | 'manual' | 'auto'

export interface TemplateStep {
  step_key: string
  name: string
  description?: string
  depends_on: string[]
  step_type?: StepType
  required_capability?: string                   // 'writing'|'coding'|'research'|...
  suggested_execution_unit_type?: ExecutionUnitType
  requires_approval?: boolean
  approval_role?: string                         // 'ceo' | 'engineering_manager' | ...
  max_attempts?: number
  estimated_minutes?: number
}

export interface WorkflowTemplate {
  id: string                                     // stable key like 'launch_landing_page'
  name: string
  description: string
  category: 'growth' | 'content' | 'product' | 'research' | 'governance'
  estimated_duration_minutes: number
  steps: TemplateStep[]
}

export const WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  // ─────────────────────────────────────────
  {
    id: 'launch_landing_page',
    name: 'Launch Landing Page',
    description: '从研究到上线：调研 → 文案 → 设计 → 预审 → 部署预览。',
    category: 'growth',
    estimated_duration_minutes: 4 * 60,
    steps: [
      { step_key: 'research',  name: 'Audience + competitor research', depends_on: [],
        required_capability: 'research', suggested_execution_unit_type: 'ai', estimated_minutes: 45 },
      { step_key: 'copy',      name: 'Draft landing page copy',         depends_on: ['research'],
        required_capability: 'writing', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'design',    name: 'Design hero + sections',          depends_on: ['research'],
        required_capability: 'design', suggested_execution_unit_type: 'agent', estimated_minutes: 90 },
      { step_key: 'review',    name: 'CEO review',                      depends_on: ['copy','design'],
        step_type: 'approval', requires_approval: true, approval_role: 'ceo',
        suggested_execution_unit_type: 'human', estimated_minutes: 15 },
      { step_key: 'deploy',    name: 'Deploy preview',                  depends_on: ['review'],
        required_capability: 'devops', suggested_execution_unit_type: 'agent', estimated_minutes: 20 },
    ],
  },

  // ─────────────────────────────────────────
  {
    id: 'create_content_piece',
    name: 'Create Content Piece',
    description: '一篇文章 / 一集脱口秀的标准生产流：选题 → 大纲 → 草稿 → 校对 → 发布。',
    category: 'content',
    estimated_duration_minutes: 3 * 60,
    steps: [
      { step_key: 'topic',     name: 'Pick topic + angle', depends_on: [],
        required_capability: 'strategy', suggested_execution_unit_type: 'ai', estimated_minutes: 20 },
      { step_key: 'outline',   name: 'Write outline',      depends_on: ['topic'],
        required_capability: 'writing', suggested_execution_unit_type: 'ai', estimated_minutes: 30 },
      { step_key: 'draft',     name: 'Write full draft',   depends_on: ['outline'],
        required_capability: 'writing', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'edit',      name: 'Edit + polish',      depends_on: ['draft'],
        required_capability: 'editing', suggested_execution_unit_type: 'human', estimated_minutes: 30 },
      { step_key: 'publish',   name: 'Publish to channel', depends_on: ['edit'],
        required_capability: 'ops', suggested_execution_unit_type: 'human', estimated_minutes: 15 },
    ],
  },

  // ─────────────────────────────────────────
  {
    id: 'customer_dev_sprint',
    name: 'Customer Development Sprint',
    description: '5 天客户发现冲刺：列名单 → 外联 → 访谈 → 复盘 → 决策',
    category: 'growth',
    estimated_duration_minutes: 5 * 8 * 60,
    steps: [
      { step_key: 'list_targets',   name: 'List 30 target customers',      depends_on: [],
        required_capability: 'research', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'outreach',       name: 'Cold-email outreach (≥30)',     depends_on: ['list_targets'],
        required_capability: 'outreach', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'schedule',       name: 'Schedule 8 interviews',         depends_on: ['outreach'],
        suggested_execution_unit_type: 'human', estimated_minutes: 120 },
      { step_key: 'interviews',     name: 'Run interviews',                depends_on: ['schedule'],
        suggested_execution_unit_type: 'human', estimated_minutes: 8 * 45 },
      { step_key: 'synthesize',     name: 'Synthesize patterns',           depends_on: ['interviews'],
        required_capability: 'strategy', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'decision',       name: 'CEO decision: go / pivot',      depends_on: ['synthesize'],
        step_type: 'approval', requires_approval: true, approval_role: 'ceo',
        suggested_execution_unit_type: 'human', estimated_minutes: 30 },
    ],
  },

  // ─────────────────────────────────────────
  {
    id: 'product_feature_build',
    name: 'Product Feature Build',
    description: '一个产品功能的端到端开发：规格 → 设计 → 实现 → QA → PR → 部署',
    category: 'product',
    estimated_duration_minutes: 12 * 60,
    steps: [
      { step_key: 'spec',         name: 'Write product spec',       depends_on: [],
        required_capability: 'product', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'ux_design',    name: 'UX design + flow',         depends_on: ['spec'],
        required_capability: 'design', suggested_execution_unit_type: 'agent', estimated_minutes: 120 },
      { step_key: 'implement',    name: 'Implement feature',        depends_on: ['ux_design'],
        required_capability: 'coding', suggested_execution_unit_type: 'agent',
        max_attempts: 3, estimated_minutes: 4 * 60 },
      { step_key: 'qa',           name: 'QA + acceptance',          depends_on: ['implement'],
        required_capability: 'qa', suggested_execution_unit_type: 'ai', estimated_minutes: 60 },
      { step_key: 'pr_review',    name: 'CTO + QA approve PR',      depends_on: ['qa'],
        step_type: 'approval', requires_approval: true, approval_role: 'engineering_manager',
        estimated_minutes: 30 },
      { step_key: 'deploy_prev',  name: 'Deploy preview',           depends_on: ['pr_review'],
        required_capability: 'devops', suggested_execution_unit_type: 'agent', estimated_minutes: 20 },
    ],
  },

  // ─────────────────────────────────────────
  {
    id: 'weekly_ceo_review',
    name: 'Weekly CEO Review',
    description: '周度 CEO 复盘：拉数据 → 经理汇报 → 风险扫描 → CEO 决策 → 写下一步',
    category: 'governance',
    estimated_duration_minutes: 90,
    steps: [
      { step_key: 'pull_metrics',  name: 'Pull weekly metrics',           depends_on: [],
        required_capability: 'analytics', suggested_execution_unit_type: 'ai', estimated_minutes: 15 },
      { step_key: 'manager_run',   name: 'Run all manager reports',       depends_on: ['pull_metrics'],
        suggested_execution_unit_type: 'ai', estimated_minutes: 15 },
      { step_key: 'risk_scan',     name: 'Scan risks + blockers',         depends_on: ['manager_run'],
        required_capability: 'risk', suggested_execution_unit_type: 'ai', estimated_minutes: 10 },
      { step_key: 'ceo_decide',    name: 'CEO decisions',                 depends_on: ['risk_scan'],
        step_type: 'approval', requires_approval: true, approval_role: 'ceo', estimated_minutes: 30 },
      { step_key: 'write_next',    name: 'Write next-week priorities',    depends_on: ['ceo_decide'],
        required_capability: 'strategy', suggested_execution_unit_type: 'ai', estimated_minutes: 20 },
    ],
  },
] as const

export function getTemplate(id: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find(t => t.id === id) ?? null
}

export function listTemplates(): ReadonlyArray<WorkflowTemplate> {
  return WORKFLOW_TEMPLATES
}

// ─────────────────────────────────────────────────
// Pure validator — checks a template's DAG is well-formed.
// Used by tests + the API before persisting.
// ─────────────────────────────────────────────────
export interface ValidationResult {
  ok: boolean
  issues: string[]
}

export function validateTemplate(t: WorkflowTemplate): ValidationResult {
  const issues: string[] = []
  const keys = new Set<string>()

  for (const s of t.steps) {
    if (!s.step_key) issues.push(`step missing step_key`)
    if (!s.name)     issues.push(`step ${s.step_key} missing name`)
    if (keys.has(s.step_key)) issues.push(`duplicate step_key: ${s.step_key}`)
    keys.add(s.step_key)
  }

  for (const s of t.steps) {
    for (const d of s.depends_on ?? []) {
      if (!keys.has(d)) issues.push(`step ${s.step_key} depends on unknown ${d}`)
      if (d === s.step_key) issues.push(`step ${s.step_key} depends on itself`)
    }
  }

  // simple cycle check (DFS)
  const adj = new Map(t.steps.map(s => [s.step_key, s.depends_on ?? []]))
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const s of t.steps) color.set(s.step_key, WHITE)
  function dfs(u: string): boolean {
    color.set(u, GRAY)
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) return true
      if (color.get(v) === WHITE && dfs(v)) return true
    }
    color.set(u, BLACK)
    return false
  }
  for (const s of t.steps) {
    if (color.get(s.step_key) === WHITE && dfs(s.step_key)) {
      issues.push(`cycle detected at ${s.step_key}`)
      break
    }
  }

  return { ok: issues.length === 0, issues }
}
