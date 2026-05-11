import { describe, it, expect } from 'vitest'
import {
  classifyActionRisk, riskLevelToLabel, riskLabelToLevel, RISK_ORDER,
} from '@/lib/approvals/risk'
import { generateExplanation, explanationToText } from '@/lib/approvals/explainer'

// ─────────────────────────────────────────────────
// Risk classifier
// ─────────────────────────────────────────────────
describe('classifyActionRisk', () => {
  describe('critical', () => {
    it('delete operations', () => {
      expect(classifyActionRisk('user.delete').label).toBe('critical')
      expect(classifyActionRisk('tasks.bulk_delete').label).toBe('critical')
    })
    it('destructive SQL', () => {
      expect(classifyActionRisk('supabase.destructive_sql').label).toBe('critical')
    })
    it('production deploy / migration', () => {
      expect(classifyActionRisk('supabase.migration.apply_production').label).toBe('critical')
      expect(classifyActionRisk('vercel.deploy.production').label).toBe('critical')
    })
    it('permission / role change', () => {
      expect(classifyActionRisk('rbac.change').label).toBe('critical')
      expect(classifyActionRisk('user.permission.modify').label).toBe('critical')
    })
    it('PR merge is irreversible', () => {
      expect(classifyActionRisk('github.pr.merge').label).toBe('critical')
    })
  })

  describe('high', () => {
    it('staging migration / db write', () => {
      expect(classifyActionRisk('supabase.migration.apply_staging').label).toBe('high')
      expect(classifyActionRisk('database.write').label).toBe('high')
    })
    it('mass email / broadcast', () => {
      expect(classifyActionRisk('email.send.broadcast').label).toBe('high')
      expect(classifyActionRisk('email.send.mass').label).toBe('high')
    })
    it('bulk modifications', () => {
      expect(classifyActionRisk('tasks.bulk_update').label).toBe('high')
    })
    it('env vars', () => {
      expect(classifyActionRisk('vercel.env.update').label).toBe('high')
    })
    it('github file write (non-merge)', () => {
      expect(classifyActionRisk('github.file.write').label).toBe('high')
    })
  })

  describe('medium', () => {
    it('preview deploy', () => {
      expect(classifyActionRisk('vercel.deploy.preview').label).toBe('medium')
    })
    it('migration draft (no apply)', () => {
      expect(classifyActionRisk('supabase.migration.create').label).toBe('medium')
    })
    it('project state change', () => {
      expect(classifyActionRisk('project.status.change').label).toBe('medium')
      expect(classifyActionRisk('project.archive').label).toBe('medium')
    })
    it('workflow creation', () => {
      expect(classifyActionRisk('workflow.create').label).toBe('medium')
    })
    it('manager report creation', () => {
      expect(classifyActionRisk('manager_report.create').label).toBe('medium')
    })
    it('PR create', () => {
      expect(classifyActionRisk('github.pr.create').label).toBe('medium')
    })
  })

  describe('low', () => {
    it('task creation', () => {
      expect(classifyActionRisk('task.create').label).toBe('low')
    })
    it('content / report generation', () => {
      expect(classifyActionRisk('content.generate').label).toBe('low')
      expect(classifyActionRisk('report.generate').label).toBe('low')
      expect(classifyActionRisk('summary.create').label).toBe('low')
    })
    it('read / list / query', () => {
      expect(classifyActionRisk('users.list').label).toBe('low')
      expect(classifyActionRisk('github.repo.list').label).toBe('low')
    })
    it('SQL validate is static', () => {
      expect(classifyActionRisk('supabase.sql.validate').label).toBe('low')
    })
  })

  it('unknown actions default to medium with explanation', () => {
    const r = classifyActionRisk('something.totally.new')
    expect(r.label).toBe('medium')
    expect(r.reason).toMatch(/未知/)
  })

  it('empty string defaults to low', () => {
    expect(classifyActionRisk('').label).toBe('low')
  })
})

describe('riskLevel ↔ riskLabel mapping', () => {
  it('numeric → label boundaries', () => {
    expect(riskLevelToLabel(0)).toBe('low')
    expect(riskLevelToLabel(1)).toBe('low')
    expect(riskLevelToLabel(2)).toBe('medium')
    expect(riskLevelToLabel(3)).toBe('high')
    expect(riskLevelToLabel(4)).toBe('critical')
  })

  it('label → numeric', () => {
    expect(riskLabelToLevel('low')).toBe(1)
    expect(riskLabelToLevel('medium')).toBe(2)
    expect(riskLabelToLevel('high')).toBe(3)
    expect(riskLabelToLevel('critical')).toBe(4)
  })

  it('RISK_ORDER monotonic', () => {
    expect(RISK_ORDER.low).toBeLessThan(RISK_ORDER.medium)
    expect(RISK_ORDER.medium).toBeLessThan(RISK_ORDER.high)
    expect(RISK_ORDER.high).toBeLessThan(RISK_ORDER.critical)
  })
})

// ─────────────────────────────────────────────────
// Explainer
// ─────────────────────────────────────────────────
describe('generateExplanation', () => {
  it('low risk → recommendation=approve, high confidence', () => {
    const e = generateExplanation({ action_type: 'task.create', risk_label: 'low' })
    expect(e.recommendation).toBe('approve')
    expect(e.confidence).toBeGreaterThan(0.7)
    expect(e.risks.length).toBeGreaterThan(0)
    expect(e.impact_if_approved.length).toBeGreaterThan(0)
    expect(e.impact_if_rejected.length).toBeGreaterThan(0)
  })

  it('medium → review_carefully', () => {
    const e = generateExplanation({ action_type: 'workflow.create', risk_label: 'medium' })
    expect(e.recommendation).toBe('review_carefully')
  })

  it('high → review_carefully + risks emphasize side effects', () => {
    const e = generateExplanation({ action_type: 'email.send.mass', risk_label: 'high' })
    expect(e.recommendation).toBe('review_carefully')
    expect(e.risks.some(r => /副作用|外部/.test(r))).toBe(true)
  })

  it('critical → recommendation=reject (conservative default)', () => {
    const e = generateExplanation({ action_type: 'tasks.bulk_delete', risk_label: 'critical' })
    expect(e.recommendation).toBe('reject')
    expect(e.risks.some(r => /不可逆/.test(r))).toBe(true)
  })

  it('destructive SQL in payload tightens recommendation', () => {
    const e = generateExplanation({
      action_type: 'supabase.migration.create',
      risk_label: 'medium',
      payload: { sql: 'DROP TABLE users;' },
    })
    expect(e.recommendation).toBe('reject')
    expect(e.risks.some(r => /破坏性 SQL/.test(r))).toBe(true)
  })

  it('main branch in payload escalates from approve to review', () => {
    const e = generateExplanation({
      action_type: 'github.pr.create',
      risk_label: 'low',
      payload: { branch: 'main' },
    })
    expect(e.recommendation).not.toBe('approve')
    expect(e.risks.some(r => /main/.test(r))).toBe(true)
  })

  it('classification_reason is surfaced first in risks', () => {
    const e = generateExplanation({
      action_type: 'task.create', risk_label: 'low',
      classification_reason: 'Detected anomalous payload size',
    })
    expect(e.risks[0]).toMatch(/anomalous/)
  })

  it('confidence is clamped to [0.2, 0.95]', () => {
    const e = generateExplanation({
      action_type: 'supabase.destructive_sql', risk_label: 'critical',
      payload: { sql: 'DROP TABLE x; DROP TABLE y;' },
    })
    expect(e.confidence).toBeGreaterThanOrEqual(0.2)
    expect(e.confidence).toBeLessThanOrEqual(0.95)
  })
})

describe('explanationToText', () => {
  it('produces a multi-section markdown blob', () => {
    const e = generateExplanation({ action_type: 'task.create', risk_label: 'low' })
    const text = explanationToText(e)
    expect(text).toMatch(/## 为什么需要审批/)
    expect(text).toMatch(/## 风险/)
    expect(text).toMatch(/## 批准后的影响/)
    expect(text).toMatch(/## 拒绝后的影响/)
    expect(text).toMatch(/## 建议/)
  })
})
