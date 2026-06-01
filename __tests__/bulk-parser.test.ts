import { describe, it, expect } from 'vitest'
import { parseProjectList, extractProjectNames } from '@/lib/projects/bulk-parser'

describe('parseProjectList — user verbatim case', () => {
  // The phrase the user pasted that previously got swallowed by the Copilot.
  const verbatim =
    '我目前已经用 Claude 做了几个项目，1、节拍器，2、财务系统，' +
    '3，客户开发系统，两个版本 4、生产系统  5、报价员   ' +
    '6、品牌运营系统   7、ai设计设计系统。'

  it('extracts 7 project names from the real input', () => {
    const r = parseProjectList(verbatim)
    expect(r.items.length).toBeGreaterThanOrEqual(6)
    expect(r.items[0]).toBe('节拍器')
    expect(r.items[1]).toBe('财务系统')
    // segment 3 has no marker space then "客户开发系统，两个版本"
    expect(r.items.some(n => n.includes('客户开发系统'))).toBe(true)
    expect(r.items.some(n => n.includes('生产系统'))).toBe(true)
    expect(r.items.some(n => n.includes('报价员'))).toBe(true)
    expect(r.items.some(n => n.includes('品牌运营'))).toBe(true)
    expect(r.items.some(n => n.includes('ai设计'))).toBe(true)
  })

  it('drops the preamble', () => {
    const r = parseProjectList(verbatim)
    expect(r.items.some(n => n.includes('Claude'))).toBe(false)
    expect(r.items.some(n => n.includes('我目前'))).toBe(false)
  })
})

describe('parseProjectList — numbered forms', () => {
  it('handles "1. 2. 3."', () => {
    const r = parseProjectList('1. A 2. B 3. C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
  it('handles "1) 2) 3)"', () => {
    const r = parseProjectList('1) A 2) B 3) C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
  it('handles "(1) (2) (3)"', () => {
    const r = parseProjectList('(1) A (2) B (3) C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
  it('handles ①②③', () => {
    const r = parseProjectList('① A ② B ③ C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
})

describe('parseProjectList — newline / bullet forms', () => {
  it('splits by newlines when no numbers', () => {
    const r = parseProjectList('节拍器\n财务系统\n客户开发系统')
    expect(r.items).toEqual(['节拍器', '财务系统', '客户开发系统'])
  })
  it('strips bullet prefixes', () => {
    const r = parseProjectList('- A\n• B\n* C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
  it('splits by commas as last resort', () => {
    const r = parseProjectList('A, B, C')
    expect(r.items).toEqual(['A', 'B', 'C'])
  })
})

describe('parseProjectList — hygiene', () => {
  it('dedups case-insensitively, keeping first form', () => {
    const r = parseProjectList('1. Foo 2. foo 3. FOO')
    expect(r.items).toEqual(['Foo'])
    expect(r.dropped.length).toBeGreaterThan(0)
  })
  it('drops empties', () => {
    const r = parseProjectList('1.   2. B 3.   4. D')
    expect(r.items).toEqual(['B', 'D'])
  })
  it('caps at 20 items', () => {
    const many = Array.from({ length: 30 }, (_, i) => `${i + 1}. P${i}`).join(' ')
    const r = parseProjectList(many)
    expect(r.items.length).toBe(20)
  })
  it('truncates over-long names', () => {
    const long = '1. ' + 'X'.repeat(200)
    const r = parseProjectList(long)
    expect(r.items[0].length).toBeLessThanOrEqual(80)
  })
  it('returns empty result on empty input', () => {
    expect(parseProjectList('').items).toEqual([])
    expect(parseProjectList('   ').items).toEqual([])
  })
  it('extractProjectNames returns just items', () => {
    expect(extractProjectNames('1. A 2. B')).toEqual(['A', 'B'])
  })
})

describe('parseProjectList — does NOT mangle short non-list text', () => {
  it('single name passes through', () => {
    const r = parseProjectList('节拍器')
    expect(r.items).toEqual(['节拍器'])
  })
})
