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
  // V2.9 — workflow status check
  | { kind: 'workflow_status' }
  // V3.1 — local agent status / read-only query
  | { kind: 'local_agent_status'; probe?: 'git_status' | 'git_branch' | 'npm_test_status' | 'build_status' | 'general' }
  // V3.0 — cost dashboard
  | { kind: 'cost_summary';
      window?: 'today' | 'week' | 'month'
      aspect?: 'most_expensive' | 'fallback' | 'by_stage' | 'general' }
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

  // V3.0 — Cost queries (run BEFORE manager_report so "CTO 成本" or
  // "今天 AI 花了多少钱" doesn't fall into a CTO report)
  {
    any: ['哪个模型最贵', '哪个模型最烧钱', 'most expensive model', '最贵的模型'],
    build: () => ({ kind: 'cost_summary', aspect: 'most_expensive' }),
  },
  {
    any: ['fallback 多吗', 'fallback 次数', 'fallback rate', '回退次数'],
    build: () => ({ kind: 'cost_summary', aspect: 'fallback' }),
  },
  {
    any: ['哪个 stage 最烧钱', '哪个 stage 最贵', '按 stage', 'by stage cost', 'stage 成本'],
    build: () => ({ kind: 'cost_summary', aspect: 'by_stage' }),
  },
  {
    any: ['今天 ai 花了多少钱', '今日 ai 成本', '今日成本', '今天花了多少钱', '今日 cost', 'today ai cost'],
    build: () => ({ kind: 'cost_summary', window: 'today' }),
  },
  {
    any: ['本周 ai 成本', '本周成本', '本周 cost', 'this week ai cost'],
    build: () => ({ kind: 'cost_summary', window: 'week' }),
  },
  {
    any: ['本月 ai 成本', '本月模型成本', '本月成本', '这个月成本', '本月 cost', 'this month ai cost', 'monthly ai cost'],
    build: () => ({ kind: 'cost_summary', window: 'month' }),
  },
  {
    any: ['ai 成本', 'ai cost', '模型成本', 'cost dashboard', '看成本', '看一下成本'],
    build: () => ({ kind: 'cost_summary', aspect: 'general' }),
  },

  // V3.1 — Local Agent (must run BEFORE manager_report; phrases like
  // "看一下 git 状态" / "本地 agent 在线吗" should land here, not in CTO report)
  {
    any: ['本地 agent', 'local agent', '本地代理', '桌面 agent', 'desktop agent'],
    build: () => ({ kind: 'local_agent_status', probe: 'general' }),
  },
  {
    any: ['看一下 git 状态', 'git 状态', 'git status', '本地 git'],
    build: () => ({ kind: 'local_agent_status', probe: 'git_status' }),
  },
  {
    any: ['当前分支', '哪个分支', 'git branch', '本地分支'],
    build: () => ({ kind: 'local_agent_status', probe: 'git_branch' }),
  },
  {
    any: ['本地测试过了吗', '本地测试状态', 'npm test 状态', 'vitest 状态'],
    build: () => ({ kind: 'local_agent_status', probe: 'npm_test_status' }),
  },
  {
    any: ['build 状态', '本地构建', '构建状态'],
    build: () => ({ kind: 'local_agent_status', probe: 'build_status' }),
  },

  // V2.9 — workflow-flavored shortcuts (run BEFORE manager_report so that
  // "哪个 workflow 卡住了" doesn't fall through to a generic CTO report)
  {
    any: [
      '哪个 workflow 卡住', '哪个工作流卡住', 'workflow 卡住',
      '哪个 workflow 阻塞了', '工作流卡点', '工作流瓶颈',
      'which workflow is blocked', 'show active workflows',
      '看 workflow 进度', '看工作流进度', 'workflow 进度',
    ],
    build: () => ({ kind: 'workflow_status' }),
  },
  // "让 COO 汇报工作流" / "CTO 看一下开发 workflow" — still go to manager_report
  // but with auto_generate so a fresh slice is built that reads workflow runtime.
  {
    pattern: /(coo|运营经理|finance manager).*(workflow|工作流|进度)/i,
    build: () => ({ kind: 'manager_report', role: 'finance_manager', auto_generate: true }),
  },
  {
    pattern: /(cto|工程经理).*(workflow|工作流|开发|dev)/i,
    build: () => ({ kind: 'manager_report', role: 'engineering_manager', auto_generate: true }),
  },
  {
    pattern: /(cgo|增长经理).*(workflow|工作流|增长)/i,
    build: () => ({ kind: 'manager_report', role: 'growth_manager', auto_generate: true }),
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
  { label: 'workflow 卡点',    sample: '哪个 workflow 卡住了', icon: '🔗' },
  { label: 'AI 成本',          sample: '今日 AI 成本',     icon: '💸' },
  { label: '批准所有低风险',   sample: '批准所有低风险事项', icon: '✅' },
  { label: '让所有经理汇报',   sample: '所有经理报告',     icon: '🤖' },
  { label: '看增长实验',       sample: '看下增长实验',     icon: '📈' },
  { label: '启动新创业',       sample: '我想做一个新项目', icon: '✨' },
  { label: '本地 agent 状态',  sample: '本地 agent 在线吗', icon: '💻' },
]
