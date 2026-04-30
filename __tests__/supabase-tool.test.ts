import { describe, it, expect } from 'vitest'
import { supabaseTool } from '@/lib/tools/supabase-tool'

async function validate(sql: string) {
  return await supabaseTool.execute('validateSql', { sql }, {}) as {
    warnings: string[]; is_safe: boolean; statement_count: number
  }
}

describe('supabase.validateSql', () => {
  it('flags DROP TABLE without IF EXISTS', async () => {
    const r = await validate('DROP TABLE users;')
    expect(r.warnings.some(w => w.includes('DROP TABLE'))).toBe(true)
  })

  it('flags DROP DATABASE as critical', async () => {
    const r = await validate('DROP DATABASE main;')
    expect(r.warnings.some(w => w.includes('DROP DATABASE'))).toBe(true)
    expect(r.is_safe).toBe(false)
  })

  it('passes IF EXISTS forms', async () => {
    const r = await validate('DROP TABLE IF EXISTS users;')
    expect(r.warnings.some(w => w.includes('DROP TABLE 不带'))).toBe(false)
  })

  it('warns when CREATE TABLE without RLS', async () => {
    const r = await validate('CREATE TABLE foo (id int);')
    expect(r.warnings.some(w => w.includes('RLS'))).toBe(true)
  })

  it('flags TRUNCATE', async () => {
    const r = await validate('TRUNCATE users;')
    expect(r.warnings.some(w => w.includes('TRUNCATE'))).toBe(true)
  })

  it('counts statements', async () => {
    const r = await validate('CREATE TABLE a(); CREATE TABLE b(); CREATE TABLE c();')
    expect(r.statement_count).toBe(3)
  })

  it('rejects empty sql', async () => {
    await expect(supabaseTool.execute('validateSql', { sql: '' }, {})).rejects.toThrow()
  })
})

describe('supabase.createMigrationFile', () => {
  it('generates timestamped filename', async () => {
    const r = await supabaseTool.execute('createMigrationFile',
      { name: 'add user prefs', sql: 'ALTER TABLE users ADD COLUMN prefs jsonb;' },
      {}) as { filename: string; suggested_path: string; statement_count: number }
    expect(r.filename).toMatch(/^\d{14}_add_user_prefs\.sql$/)
    expect(r.suggested_path).toContain('supabase/migrations/')
    expect(r.statement_count).toBe(1)
  })

  it('rejects missing fields', async () => {
    await expect(supabaseTool.execute('createMigrationFile', { name: 'x' }, {})).rejects.toThrow()
    await expect(supabaseTool.execute('createMigrationFile', { sql: 'x' }, {})).rejects.toThrow()
  })
})
