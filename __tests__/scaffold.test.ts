import { describe, it, expect } from 'vitest'
import { slugify, buildScaffoldCommand, STACKS } from '@/lib/projects/scaffold'

describe('slugify', () => {
  it('lowercases + hyphenates ascii', () => {
    expect(slugify('My Cool App')).toBe('my-cool-app')
  })
  it('collapses non-ascii (Chinese) to hyphens and trims', () => {
    expect(slugify('ai 财务系统')).toBe('ai')           // chinese → stripped, leading token kept
    expect(slugify('Order Beat 节拍器')).toBe('order-beat')
  })
  it('falls back to my-project when empty', () => {
    expect(slugify('财务系统')).toBe('my-project')      // all non-ascii
    expect(slugify('')).toBe('my-project')
    expect(slugify('   ')).toBe('my-project')
  })
  it('strips leading/trailing hyphens and dedups', () => {
    expect(slugify('--a---b--')).toBe('a-b')
  })
})

describe('buildScaffoldCommand', () => {
  it('nextjs-supabase produces a create-next-app + supabase + git command', () => {
    const p = buildScaffoldCommand({ dirName: 'my-app', stack: 'nextjs-supabase' })
    expect(p.command).toContain('create-next-app@latest my-app')
    expect(p.command).toContain('@supabase/supabase-js')
    expect(p.command).toContain('git init')
    expect(p.steps.length).toBeGreaterThanOrEqual(3)
    expect(p.next.some(n => n.includes('GitHub'))).toBe(true)
    expect(p.next.some(n => n.includes('Vercel'))).toBe(true)
    expect(p.next.some(n => n.includes('Supabase'))).toBe(true)
  })

  it('node stack uses npm init + tsx', () => {
    const p = buildScaffoldCommand({ dirName: 'svc', stack: 'node' })
    expect(p.command).toContain('npm init -y')
    expect(p.command).toContain('tsx')
    expect(p.command).toContain('svc')
  })

  it('empty stack just makes a dir + readme + git', () => {
    const p = buildScaffoldCommand({ dirName: 'x', stack: 'empty' })
    expect(p.command).toContain('mkdir -p x')
    expect(p.command).toContain('README.md')
    expect(p.command).toContain('git init')
  })

  it('sanitizes dangerous dir names (no traversal / shell metachars)', () => {
    const p = buildScaffoldCommand({ dirName: '../../etc/passwd', stack: 'empty' })
    expect(p.dir_name).not.toContain('..')
    expect(p.dir_name).not.toContain('/')
    const evil = buildScaffoldCommand({ dirName: 'a; rm -rf ~', stack: 'empty' })
    expect(evil.dir_name).not.toContain(';')
    expect(evil.dir_name).not.toContain(' ')
    expect(evil.dir_name).not.toContain('~')
  })

  it('every advertised stack builds a non-empty command', () => {
    for (const s of STACKS) {
      const p = buildScaffoldCommand({ dirName: 'd', stack: s.id })
      expect(p.command.length).toBeGreaterThan(10)
    }
  })
})
