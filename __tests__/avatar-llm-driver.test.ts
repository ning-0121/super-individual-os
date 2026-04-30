import { describe, it, expect } from 'vitest'
import { parseLLMAvatarOutput, applyLLMOutput, suggestFromText } from '@/lib/avatar/llm-driver'
import { DEFAULT_AVATAR_STATE } from '@/lib/avatar/types'

describe('avatar.parseLLMAvatarOutput', () => {
  it('accepts a valid object with all fields', () => {
    const r = parseLLMAvatarOutput({ mood: 'happy', expression: 'smile', action: 'wave', reason: 'hi' })
    expect(r).toEqual({ mood: 'happy', expression: 'smile', action: 'wave', reason: 'hi' })
  })

  it('accepts partial output', () => {
    const r = parseLLMAvatarOutput({ action: 'nod' })
    expect(r).toEqual({ action: 'nod' })
  })

  it('rejects all-empty output', () => {
    expect(parseLLMAvatarOutput({})).toBeNull()
    expect(parseLLMAvatarOutput({ reason: 'just text' })).toBeNull()  // reason alone is not enough
  })

  it('rejects invalid enum values', () => {
    const r = parseLLMAvatarOutput({ mood: 'bouncy', action: 'breakdance' })
    expect(r).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(parseLLMAvatarOutput(null)).toBeNull()
    expect(parseLLMAvatarOutput('hello')).toBeNull()
    expect(parseLLMAvatarOutput(42)).toBeNull()
  })

  it('partial valid + partial invalid keeps only valid', () => {
    const r = parseLLMAvatarOutput({ mood: 'happy', action: 'breakdance', expression: 'smile' })
    expect(r).toEqual({ mood: 'happy', expression: 'smile' })
  })
})

describe('avatar.applyLLMOutput', () => {
  it('overrides only specified fields', () => {
    const next = applyLLMOutput(DEFAULT_AVATAR_STATE, { action: 'wave' })
    expect(next.action).toBe('wave')
    expect(next.outfit).toBe(DEFAULT_AVATAR_STATE.outfit)
    expect(next.growth_stage).toBe(DEFAULT_AVATAR_STATE.growth_stage)
  })

  it('returns new object (does not mutate)', () => {
    const out = applyLLMOutput(DEFAULT_AVATAR_STATE, { mood: 'sad' })
    expect(out).not.toBe(DEFAULT_AVATAR_STATE)
    expect(DEFAULT_AVATAR_STATE.mood).toBe('neutral')  // original unchanged
  })
})

describe('avatar.suggestFromText (heuristic)', () => {
  it('detects greeting → wave', () => {
    expect(suggestFromText('Hi there!')).toMatchObject({ action: 'wave' })
    expect(suggestFromText('你好啊')).toMatchObject({ action: 'wave' })
  })

  it('detects sadness', () => {
    const r = suggestFromText('I am so sad today')
    expect(r.mood).toBe('sad')
    expect(r.expression).toBe('sad')
  })

  it('detects happiness', () => {
    const r = suggestFromText('this is awesome')
    expect(r.mood).toBe('happy')
    expect(r.action).toBe('happy')
  })

  it('detects anger', () => {
    expect(suggestFromText('I am angry')).toMatchObject({ mood: 'angry', expression: 'angry' })
  })

  it('detects surprise → surprised expression', () => {
    expect(suggestFromText('Wow amazing!')).toMatchObject({ expression: 'surprised' })
  })

  it('detects agreement → nod', () => {
    expect(suggestFromText('yes I agree')).toMatchObject({ action: 'nod' })
  })

  it('returns empty for neutral text', () => {
    expect(suggestFromText('what is the weather')).toEqual({})
  })
})
