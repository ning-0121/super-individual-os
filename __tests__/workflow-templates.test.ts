import { describe, it, expect } from 'vitest'
import {
  WORKFLOW_TEMPLATES, getTemplate, listTemplates, validateTemplate,
  type WorkflowTemplate,
} from '@/lib/workflows/templates'

describe('WORKFLOW_TEMPLATES — registry shape', () => {
  it('ships exactly 5 templates', () => {
    expect(WORKFLOW_TEMPLATES.length).toBe(5)
    expect(listTemplates().length).toBe(5)
  })

  it('all required IDs are present', () => {
    const ids = WORKFLOW_TEMPLATES.map(t => t.id).sort()
    expect(ids).toEqual([
      'create_content_piece',
      'customer_dev_sprint',
      'launch_landing_page',
      'product_feature_build',
      'weekly_ceo_review',
    ])
  })

  it('every template has name, description, category, estimated_duration', () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
      expect(['growth','content','product','research','governance']).toContain(t.category)
      expect(t.estimated_duration_minutes).toBeGreaterThan(0)
      expect(t.steps.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('every step has required fields', () => {
    for (const t of WORKFLOW_TEMPLATES) {
      for (const s of t.steps) {
        expect(s.step_key.length).toBeGreaterThan(0)
        expect(s.name.length).toBeGreaterThan(0)
        expect(Array.isArray(s.depends_on)).toBe(true)
      }
    }
  })
})

describe('getTemplate', () => {
  it('finds by id', () => {
    expect(getTemplate('launch_landing_page')?.id).toBe('launch_landing_page')
  })
  it('returns null on miss', () => {
    expect(getTemplate('does_not_exist')).toBeNull()
  })
})

describe('validateTemplate — every shipped template must be valid', () => {
  for (const t of WORKFLOW_TEMPLATES) {
    it(`${t.id} has a valid DAG`, () => {
      const r = validateTemplate(t)
      if (!r.ok) console.error(t.id, r.issues)
      expect(r.ok).toBe(true)
      expect(r.issues).toEqual([])
    })
  }
})

describe('validateTemplate — error paths', () => {
  function tpl(steps: WorkflowTemplate['steps']): WorkflowTemplate {
    return {
      id: 'x', name: 'x', description: 'x',
      category: 'growth', estimated_duration_minutes: 1, steps,
    }
  }

  it('duplicate step_key flagged', () => {
    const r = validateTemplate(tpl([
      { step_key: 'a', name: 'A', depends_on: [] },
      { step_key: 'a', name: 'A2', depends_on: [] },
    ]))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => /duplicate/.test(i))).toBe(true)
  })

  it('depends on unknown step flagged', () => {
    const r = validateTemplate(tpl([
      { step_key: 'a', name: 'A', depends_on: ['ghost'] },
    ]))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => /unknown/.test(i))).toBe(true)
  })

  it('self-dependency flagged', () => {
    const r = validateTemplate(tpl([
      { step_key: 'a', name: 'A', depends_on: ['a'] },
    ]))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => /itself|cycle/.test(i))).toBe(true)
  })

  it('cycle between steps flagged', () => {
    const r = validateTemplate(tpl([
      { step_key: 'a', name: 'A', depends_on: ['b'] },
      { step_key: 'b', name: 'B', depends_on: ['a'] },
    ]))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => /cycle/.test(i))).toBe(true)
  })
})

describe('templates surface useful execution metadata', () => {
  it('product_feature_build has a requires_approval gate', () => {
    const t = getTemplate('product_feature_build')!
    expect(t.steps.some(s => s.requires_approval && s.approval_role === 'engineering_manager')).toBe(true)
  })

  it('weekly_ceo_review has a CEO approval gate', () => {
    const t = getTemplate('weekly_ceo_review')!
    expect(t.steps.some(s => s.approval_role === 'ceo')).toBe(true)
  })

  it('launch_landing_page has parallel branches (copy + design after research)', () => {
    const t = getTemplate('launch_landing_page')!
    const copy = t.steps.find(s => s.step_key === 'copy')!
    const design = t.steps.find(s => s.step_key === 'design')!
    expect(copy.depends_on).toEqual(['research'])
    expect(design.depends_on).toEqual(['research'])
  })
})
