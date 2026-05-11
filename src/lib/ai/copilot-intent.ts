// ─────────────────────────────────────────────────
// V2.3 — Copilot Intent Classifier (pure)
// Maps a single natural-language line to a typed action.
// Rule-based first; everything that doesn't match falls through to `chat`.
// ─────────────────────────────────────────────────

export type CopilotIntent =
  | { kind: 'list_systems' }
  | { kind: 'list_projects' }
  | { kind: 'list_tasks' }
  | { kind: 'list_approvals' }
  | { kind: 'list_growth' }
  | { kind: 'nav'; route: string; label: string }
  | { kind: 'start_venture'; seed: string }
  | { kind: 'manager_report'; role?: string; auto_generate?: boolean }
  | { kind: 'blockers_overview' }
  // V2.4 — governance
  | { kind: 'bulk_approve'; risk_label: 'low' | 'medium' | 'high' | 'critical' }
  | { kind: 'bulk_reject';  risk_label: 'low' | 'medium' | 'high' | 'critical' }
  | { kind: 'help' }
  | { kind: 'chat'; query: string }

interface Rule {
  // First match wins. Patterns can be:
  // - exact substrings (lowercased) in `any` — match if any contained
  // - regex in `pattern`
  any?: string[]
  pattern?: RegExp
  build: (input: string, m?: RegExpMatchArray | null) => CopilotIntent
}

const RULES: Rule[] = [
  // Help / commands
  {
    any: ['/help', 'help', '帮助', '命令', 'commands'],
    build: () => ({ kind: 'help' }),
  },

  // Navigation
  {
    any: ['去审批', '打开审批', '审批中心', '/approvals', 'approvals'],
    build: () => ({ kind: 'nav', route: '/approvals', label: '审批中心' }),
  },
  {
    any: ['打开 mission control', '看 mission control', '指挥中心', '/mission-control'],
    build: () => ({ kind: 'nav', route: '/mission-control', label: 'Mission Control' }),
  },
  {
    any: ['打开工具', '工具页', 'tools 页面', '/tools'],
    build: () => ({ kind: 'nav', route: '/tools', label: '工具' }),
  },
  {
    any: ['工具自治', 'tool autonomy', '/tools/autonomy'],
    build: () => ({ kind: 'nav', route: '/tools/autonomy', label: '工具自治' }),
  },
  {
    any: ['second brain', '设置', '/settings'],
    build: () => ({ kind: 'nav', route: '/settings', label: 'Second Brain' }),
  },

  // Start a venture — must come BEFORE list_projects so phrases like
  // "新建项目" route here. Match if input contains both a creation verb
  // and a venture noun.
  {
    pattern: /(?:我想|^想|要做|帮我|新建|创建|建一个|建个|启动|做一个|做个|搞一个|搞个|开一个|开个|new|start)/i,
    build: (input, m) => {
      if (!m) return { kind: 'chat', query: input }
      // Verify a venture-noun is also present
      const hasNoun = /(创业|venture|项目|系统|生意|业务|产品|工厂|公司|品牌|平台|工具|app|产品线)/i.test(input)
      if (hasNoun) return { kind: 'start_venture', seed: input.trim() }
      return { kind: 'chat', query: input }
    },
  },
  {
    any: ['new venture', 'start venture', '新创业', '新业务', '新生意'],
    build: (input) => ({ kind: 'start_venture', seed: input.trim() }),
  },

  // Lists
  {
    any: ['看系统', '看下系统', '我的系统', 'list systems', '列出系统', '系统列表'],
    build: () => ({ kind: 'list_systems' }),
  },
  {
    any: ['看项目', '看下项目', '我的项目', 'list projects', '列出项目', '项目列表'],
    build: () => ({ kind: 'list_projects' }),
  },
  {
    any: ['待办', '看任务', '我的任务', 'list tasks', '任务列表', '今天做什么', '今天要做'],
    build: () => ({ kind: 'list_tasks' }),
  },
  {
    any: ['待审批', '看审批', 'list approvals', '审批列表', '需要批准'],
    build: () => ({ kind: 'list_approvals' }),
  },
  {
    any: ['增长实验', '看实验', 'list growth', 'experiments', '实验列表'],
    build: () => ({ kind: 'list_growth' }),
  },

  // Bulk approval / rejection — V2.4 governance
  {
    any: ['批准所有低风险', '批准所有 low', '批准所有低风险事项', 'approve all low risk'],
    build: () => ({ kind: 'bulk_approve', risk_label: 'low' }),
  },
  {
    any: ['批准所有中等风险', '批准所有 medium', 'approve all medium risk'],
    build: () => ({ kind: 'bulk_approve', risk_label: 'medium' }),
  },
  {
    any: ['拒绝所有高风险', '拒绝高风险事项', '拒绝高风险', 'reject all high risk'],
    build: () => ({ kind: 'bulk_reject', risk_label: 'high' }),
  },
  {
    any: ['拒绝所有 critical', '拒绝所有关键风险', 'reject all critical'],
    build: () => ({ kind: 'bulk_reject', risk_label: 'critical' }),
  },

  // Blockers overview — must come BEFORE manager_report rules so phrases
  // like "今天谁有问题" / "哪个项目卡住了" route here.
  {
    any: [
      '今天谁有问题', '谁有问题', '哪个项目卡住', '哪个项目卡住了',
      '哪里卡住', '哪里卡住了', '谁卡住了', '今天有什么阻塞',
      'blockers', 'who is blocked', 'what is blocked',
    ],
    build: () => ({ kind: 'blockers_overview' }),
  },

  // Manager reports — extended to also trigger on "汇报" / "报告" / "状态"
  {
    pattern: /(cto|工程经理).*(汇报|报告|状态)/i,
    build: () => ({ kind: 'manager_report', role: 'engineering_manager', auto_generate: true }),
  },
  {
    pattern: /(ceo).*(汇报|报告|判断)/i,
    build: () => ({ kind: 'manager_report', role: 'ceo', auto_generate: true }),
  },
  {
    pattern: /(coo|运营经理|finance manager|财务经理).*(汇报|报告)/i,
    build: () => ({ kind: 'manager_report', role: 'finance_manager', auto_generate: true }),
  },
  {
    pattern: /(cgo|增长经理|growth manager).*(汇报|报告)/i,
    build: () => ({ kind: 'manager_report', role: 'growth_manager', auto_generate: true }),
  },
  {
    pattern: /(cpo|设计经理|product manager|产品经理).*(汇报|报告)/i,
    build: () => ({ kind: 'manager_report', role: 'design_manager', auto_generate: true }),
  },
  {
    pattern: /(qa|测试).*(汇报|报告)/i,
    build: () => ({ kind: 'manager_report', role: 'qa_manager', auto_generate: true }),
  },
  {
    pattern: /(cso|风险|risk).*(汇报|报告)/i,
    build: () => ({ kind: 'manager_report', role: 'risk_manager', auto_generate: true }),
  },
  {
    pattern: /(增长汇报|增长报告)/i,
    build: () => ({ kind: 'manager_report', role: 'growth_manager', auto_generate: true }),
  },
  {
    any: ['经理汇报', '让经理汇报', '所有经理报告', '经理报告', 'manager report', '让所有经理汇报'],
    build: () => ({ kind: 'manager_report', auto_generate: true }),
  },
]

export function classifyIntent(rawInput: string): CopilotIntent {
  const input = rawInput.trim()
  if (!input) return { kind: 'chat', query: '' }
  const lower = input.toLowerCase()

  for (const r of RULES) {
    if (r.any && r.any.some(s => lower.includes(s.toLowerCase()))) {
      return r.build(input)
    }
    if (r.pattern) {
      const m = lower.match(r.pattern)
      if (m) return r.build(input, m)
    }
  }

  return { kind: 'chat', query: input }
}

// Quick-action menu shown on the empty Copilot panel
export const QUICK_ACTIONS: Array<{ label: string; sample: string; icon: string }> = [
  { label: '今天该做什么',     sample: '今天要做什么',     icon: '📋' },
  { label: '哪里卡住了',       sample: '今天谁有问题',     icon: '🚧' },
  { label: '看待审批',         sample: '看下待审批',       icon: '🛡' },
  { label: '批准所有低风险',   sample: '批准所有低风险事项', icon: '✅' },
  { label: '让所有经理汇报',   sample: '所有经理报告',     icon: '🤖' },
  { label: '看增长实验',       sample: '看下增长实验',     icon: '📈' },
  { label: '启动新创业',       sample: '我想做一个新项目', icon: '✨' },
]
