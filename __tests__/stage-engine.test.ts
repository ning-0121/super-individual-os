import { describe, it, expect } from 'vitest'
import { STAGES, getStage, getNextStage, getPrevStage, TOTAL_STAGES } from '@/lib/stages/definitions'
import { buildStageContextForLLM, isAgentRecommendedForStage } from '@/lib/stages/engine'

describe('stage definitions', () => {
  it('has exactly 11 stages', () => {
    expect(STAGES).toHaveLength(11)
    expect(TOTAL_STAGES).toBe(11)
  })

  it('stage ids are 1-11 sequential', () => {
    for (let i = 0; i < STAGES.length; i++) {
      expect(STAGES[i].id).toBe(i + 1)
    }
  })

  it('every stage has required fields', () => {
    for (const s of STAGES) {
      expect(s.key).toBeTruthy()
      expect(s.name_zh).toBeTruthy()
      expect(s.name_en).toBeTruthy()
      expect(s.short).toBeTruthy()
      expect(s.goal).toBeTruthy()
      expect(s.success_criteria).toBeTruthy()
      expect(Array.isArray(s.recommended_agents)).toBe(true)
      expect(s.recommended_agents.length).toBeGreaterThan(0)
      expect(Array.isArray(s.required_artifact_types)).toBe(true)
    }
  })

  it('getStage returns correct stage', () => {
    expect(getStage(1)?.key).toBe('discover_needs')
    expect(getStage(6)?.key).toBe('mvp')
    expect(getStage(11)?.key).toBe('go_to_market')
    expect(getStage(0)).toBeNull()
    expect(getStage(12)).toBeNull()
  })

  it('getNextStage / getPrevStage handle boundaries', () => {
    expect(getNextStage(1)?.id).toBe(2)
    expect(getNextStage(11)).toBeNull()
    expect(getPrevStage(1)).toBeNull()
    expect(getPrevStage(11)?.id).toBe(10)
  })

  it('stage 4 (prototype) is skippable for tool products', () => {
    expect(getStage(4)?.can_skip).toBe(true)
  })

  it('stage 10 has outcome options', () => {
    const s10 = getStage(10)
    expect(s10?.outcome_options).toContain('succeeded')
    expect(s10?.outcome_options).toContain('failed')
    expect(s10?.outcome_options).toContain('pivoted')
  })
})

describe('buildStageContextForLLM', () => {
  it('returns empty for invalid stage', () => {
    expect(buildStageContextForLLM(99)).toBe('')
    expect(buildStageContextForLLM(0)).toBe('')
  })

  it('produces stage-aware prompt block for valid stage', () => {
    const block = buildStageContextForLLM(5)
    expect(block).toContain('做产品功能')
    expect(block).toContain('阶段 5/11')
    expect(block).toContain('engineering')
  })

  it('block guides LLM not to drift across stages', () => {
    const block = buildStageContextForLLM(1)
    expect(block).toMatch(/不要让用户/)
  })
})

describe('isAgentRecommendedForStage', () => {
  it('research agent recommended for discover_needs', () => {
    expect(isAgentRecommendedForStage('research', 1)).toBe(true)
  })

  it('engineering agent NOT recommended for discover_needs', () => {
    expect(isAgentRecommendedForStage('engineering', 1)).toBe(false)
  })

  it('engineering agent recommended for features stage', () => {
    expect(isAgentRecommendedForStage('engineering', 5)).toBe(true)
  })

  it('growth agent recommended for first_users stage', () => {
    expect(isAgentRecommendedForStage('growth', 8)).toBe(true)
  })

  it('returns true for invalid stage (no filter)', () => {
    expect(isAgentRecommendedForStage('engineering', 99)).toBe(true)
  })
})
