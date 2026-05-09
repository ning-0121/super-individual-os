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
    })
    it('CTO 汇报', () => {
      const i = classifyIntent('CTO 汇报一下')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('engineering_manager')
    })
    it('CGO 报告', () => {
      const i = classifyIntent('CGO 出个增长报告')
      expect(i.kind).toBe('manager_report')
      if (i.kind === 'manager_report') expect(i.role).toBe('growth_manager')
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
