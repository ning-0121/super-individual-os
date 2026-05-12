import { describe, it, expect } from 'vitest'
import { classifyIntent } from '@/lib/ai/copilot-intent'

describe('Copilot intent classifier', () => {
  it('empty input → chat with empty query', () => {
    expect(classifyIntent('')).toEqual({ kind: 'chat', query: '' })
    expect(classifyIntent('   ')).toEqual({ kind: 'chat', query: '' })
  })

  it('help variants', () => {
    expect(classifyIntent('/help').kind).toBe('help')
    expect(classifyIntent('帮助').kind).toBe('help')
    expect(classifyIntent('commands').kind).toBe('help')
  })

  describe('navigation', () => {
    it('approvals', () => {
      const i = classifyIntent('去审批')
      expect(i.kind).toBe('nav')
      if (i.kind === 'nav') expect(i.route).toBe('/approvals')
    })
    it('mission control', () => {
      const i = classifyIntent('打开 mission control')
      expect(i.kind).toBe('nav')
      if (i.kind === 'nav') expect(i.route).toBe('/mission-control')
    })
    it('tool autonomy', () => {
      const i = classifyIntent('看下 tool autonomy')
      expect(i.kind).toBe('nav')
      if (i.kind === 'nav') expect(i.route).toBe('/tools/autonomy')
    })
  })

  describe('lists', () => {
    it('list systems CN', () => {
      expect(classifyIntent('看下我的系统').kind).toBe('list_systems')
      expect(classifyIntent('系统列表').kind).toBe('list_systems')
    })
    it('list projects', () => {
      expect(classifyIntent('我的项目').kind).toBe('list_projects')
    })
    it('list tasks — "今天做什么"', () => {
      expect(classifyIntent('今天做什么').kind).toBe('list_tasks')
      expect(classifyIntent('待办').kind).toBe('list_tasks')
    })
    it('list approvals', () => {
      expect(classifyIntent('看待审批').kind).toBe('list_approvals')
      expect(classifyIntent('需要批准的').kind).toBe('list_approvals')
    })
    it('list growth experiments', () => {
      expect(classifyIntent('看下增长实验').kind).toBe('list_growth')
    })
  })

  describe('start venture', () => {
    it('我想做一个新项目', () => {
      const i = classifyIntent('我想做一个新项目')
      expect(i.kind).toBe('start_venture')
      if (i.kind === 'start_venture') expect(i.seed).toBe('我想做一个新项目')
    })
    it('启动新创业 phrase', () => {
      expect(classifyIntent('帮我启动新创业').kind).toBe('start_venture')
    })
    it('start a new venture', () => {
      expect(classifyIntent('I want to start a new venture').kind).toBe('start_venture')
    })
    it('AI 人格内容工厂 (the user\'s actual case) — falls through to chat', () => {
      // Free-form vision without trigger phrase → chat (will be answered by AI)
      const i = classifyIntent('AI 人格内容工厂，做历史人物脱口秀')
      expect(i.kind).toBe('chat')
    })
    it('"想做一个 AI 人格内容工厂" → start_venture', () => {
      expect(classifyIntent('想做一个 AI 人格内容工厂').kind).toBe('start_venture')
    })
  })

  describe('manager reports', () => {
    it('generic manager report', () => {
      const i = classifyIntent('让经理汇报一下')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.auto_generate).toBe(true)
    })
    it('CTO 汇报', () => {
      const i = classifyIntent('CTO 汇报一下')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('engineering_manager')
    })
    it('CEO 判断 → ceo role', () => {
      const i = classifyIntent('CEO 你的判断是什么')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('ceo')
    })
    it('CGO 报告', () => {
      const i = classifyIntent('CGO 出个增长报告')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('growth_manager')
    })
    it('增长汇报 → growth_manager', () => {
      const i = classifyIntent('增长汇报')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('growth_manager')
    })
    it('COO 汇报 → finance_manager', () => {
      const i = classifyIntent('COO 汇报一下')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('finance_manager')
    })
  })

  describe('cost summary (V3.0)', () => {
    it('"今天 AI 花了多少钱" → cost_summary today', () => {
      const i = classifyIntent('今天 AI 花了多少钱')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.window).toBe('today')
    })
    it('"本月模型成本" → cost_summary month', () => {
      const i = classifyIntent('本月模型成本')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.window).toBe('month')
    })
    it('"哪个模型最贵" → cost_summary most_expensive', () => {
      const i = classifyIntent('哪个模型最贵')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.aspect).toBe('most_expensive')
    })
    it('"fallback 多吗" → cost_summary fallback', () => {
      const i = classifyIntent('fallback 多吗？')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.aspect).toBe('fallback')
    })
    it('"哪个 stage 最烧钱" → cost_summary by_stage', () => {
      const i = classifyIntent('哪个 stage 最烧钱')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.aspect).toBe('by_stage')
    })
    it('"看一下成本" → cost_summary general', () => {
      const i = classifyIntent('看一下成本')
      expect(i.kind).toBe('cost_summary')
      if (i.kind === 'cost_summary') expect(i.aspect).toBe('general')
    })
  })

  describe('workflow status (V2.9)', () => {
    it('"哪个 workflow 卡住了" → workflow_status', () => {
      expect(classifyIntent('哪个 workflow 卡住了').kind).toBe('workflow_status')
    })
    it('"workflow 卡住" 短问', () => {
      expect(classifyIntent('workflow 卡住').kind).toBe('workflow_status')
    })
    it('"看工作流进度"', () => {
      expect(classifyIntent('看工作流进度').kind).toBe('workflow_status')
    })
    it('"which workflow is blocked"', () => {
      expect(classifyIntent('which workflow is blocked').kind).toBe('workflow_status')
    })
    it('"COO 汇报工作流" → manager_report finance_manager', () => {
      const i = classifyIntent('COO 汇报工作流')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('finance_manager')
    })
    it('"CTO 看下开发 workflow" → manager_report engineering_manager', () => {
      const i = classifyIntent('CTO 看下开发 workflow')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('engineering_manager')
    })
  })

  describe('bulk approve / reject (governance V2.4)', () => {
    it('"批准所有低风险事项" → bulk_approve low', () => {
      const i = classifyIntent('批准所有低风险事项')
      expect(i.kind).toBe('bulk_approve')
      if (i.kind === 'bulk_approve') expect(i.risk_label).toBe('low')
    })
    it('"approve all low risk" (EN)', () => {
      expect(classifyIntent('approve all low risk').kind).toBe('bulk_approve')
    })
    it('"拒绝高风险" → bulk_reject high', () => {
      const i = classifyIntent('拒绝高风险事项')
      expect(i.kind).toBe('bulk_reject')
      if (i.kind === 'bulk_reject') expect(i.risk_label).toBe('high')
    })
    it('"拒绝所有 critical" → bulk_reject critical', () => {
      const i = classifyIntent('拒绝所有 critical 项')
      expect(i.kind).toBe('bulk_reject')
      if (i.kind === 'bulk_reject') expect(i.risk_label).toBe('critical')
    })
  })

  describe('blockers overview', () => {
    it('"今天谁有问题"', () => {
      expect(classifyIntent('今天谁有问题').kind).toBe('blockers_overview')
    })
    it('"哪个项目卡住了"', () => {
      expect(classifyIntent('哪个项目卡住了').kind).toBe('blockers_overview')
    })
    it('"who is blocked"', () => {
      expect(classifyIntent('who is blocked today?').kind).toBe('blockers_overview')
    })
  })

  describe('chat fallback', () => {
    it('a strategy question falls to chat', () => {
      const i = classifyIntent('我应该先做哪个 IP？')
      expect(i.kind).toBe('chat')
      if (i.kind === 'chat') expect(i.query).toBe('我应该先做哪个 IP？')
    })
    it('a vague description falls to chat', () => {
      expect(classifyIntent('解释一下脱口秀的市场规模').kind).toBe('chat')
    })
  })

  it('first-match-wins: "新建项目" routes to start_venture, not list_projects', () => {
    expect(classifyIntent('新建项目').kind).toBe('start_venture')
  })
})
