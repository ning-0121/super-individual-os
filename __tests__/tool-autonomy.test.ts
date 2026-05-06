import { describe, it, expect } from 'vitest'
import { classifyToolRisk } from '@/lib/tools/tool-autonomy'
import { TOOL_CAPABILITIES, findCapability, requiredApproversFor } from '@/lib/tools/capabilities'
import { classifySqlSafety, hasRollbackSection, hasVerifySection } from '@/lib/tools/sql-safety'
import {
  createMigrationBundle, validateMigrationContract,
} from '@/lib/tools/supabase-tool-v2'
import { routeModelForTask } from '@/lib/ai/model-router'

// ─────────────────────────────────────────────────
// Capability registry
// ─────────────────────────────────────────────────
describe('TOOL_CAPABILITIES registry', () => {
  it('contains all GitHub actions per spec', () => {
    const actions = TOOL_CAPABILITIES.map(c => c.action)
    expect(actions).toContain('github.repo.list')
    expect(actions).toContain('github.file.read')
    expect(actions).toContain('github.branch.create')
    expect(actions).toContain('github.issue.create')
    expect(actions).toContain('github.file.write')
    expect(actions).toContain('github.pr.create')
    expect(actions).toContain('github.pr.merge')
  })

  it('github.pr.merge is L4 require_ceo', () => {
    const cap = findCapability('github.pr.merge')!
    expect(cap.risk_level).toBe(4)
    expect(cap.require_ceo).toBe(true)
  })

  it('github.pr.create requires CTO + QA', () => {
    const cap = findCapability('github.pr.create')!
    expect(cap.risk_level).toBe(2)
    expect(cap.manager_role).toBe('engineering_manager')
    expect(cap.require_qa).toBe(true)
  })

  it('vercel.deploy.production is L4 require_ceo', () => {
    const cap = findCapability('vercel.deploy.production')!
    expect(cap.risk_level).toBe(4)
    expect(cap.require_ceo).toBe(true)
  })

  it('supabase.migration.apply_production is L4 require_ceo', () => {
    const cap = findCapability('supabase.migration.apply_production')!
    expect(cap.risk_level).toBe(4)
    expect(cap.require_ceo).toBe(true)
  })

  it('supabase.destructive_sql is L4 require_ceo', () => {
    const cap = findCapability('supabase.destructive_sql')!
    expect(cap.risk_level).toBe(4)
    expect(cap.require_ceo).toBe(true)
  })

  it('local_agent.command.run is L3 CTO+QA', () => {
    const cap = findCapability('local_agent.command.run')!
    expect(cap.risk_level).toBe(3)
    expect(cap.manager_role).toBe('engineering_manager')
    expect(cap.require_qa).toBe(true)
  })

  it('requiredApproversFor includes ceo for L4 caps', () => {
    const merge = findCapability('github.pr.merge')!
    expect(requiredApproversFor(merge)).toContain('ceo')
  })

  it('requiredApproversFor combines manager + qa for L2 PR', () => {
    const cap = findCapability('github.pr.create')!
    const r = requiredApproversFor(cap)
    expect(r).toContain('engineering_manager')
    expect(r).toContain('qa_manager')
  })
})

// ─────────────────────────────────────────────────
// classifyToolRisk
// ─────────────────────────────────────────────────
describe('classifyToolRisk', () => {
  it('L0 read action requires no approvers', () => {
    const r = classifyToolRisk('github.repo.list', {})
    expect(r.risk_level).toBe(0)
    expect(r.required_approvers).toEqual([])
  })

  it('GitHub PR create → L2 + CTO + QA', () => {
    const r = classifyToolRisk('github.pr.create', {
      branch: 'feat/x', base: 'main', title: 't', body: 'b', files: [],
    })
    expect(r.risk_level).toBe(2)
    expect(r.required_approvers).toContain('engineering_manager')
    expect(r.required_approvers).toContain('qa_manager')
  })

  it('GitHub write to main → escalates to L4 CEO', () => {
    const r = classifyToolRisk('github.file.write', {
      branch: 'main', path: 'README.md', content: 'x',
    })
    expect(r.risk_level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
    expect(r.flags).toContain('write_to_main')
  })

  it('GitHub merge PR is always L4', () => {
    expect(classifyToolRisk('github.pr.merge', { pr_number: 12 }).risk_level).toBe(4)
  })

  it('Vercel production deploy is L4 ceo', () => {
    const r = classifyToolRisk('vercel.deploy.production', { project: 'p' })
    expect(r.risk_level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })

  it('Supabase migration with destructive SQL → L4 ceo', () => {
    const r = classifyToolRisk('supabase.migration.create', {
      sql: 'DROP TABLE users;',
    })
    expect(r.risk_level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
    expect(r.flags).toContain('drop_table')
  })

  it('Supabase migration without destructive SQL → L2 CTO + QA', () => {
    const r = classifyToolRisk('supabase.migration.create', {
      sql: 'ALTER TABLE foo ADD COLUMN bar text;',
    })
    expect(r.risk_level).toBe(2)
    expect(r.required_approvers).toContain('engineering_manager')
    expect(r.required_approvers).toContain('qa_manager')
  })

  it('Unknown capability → L4 ceo (fail-safe)', () => {
    const r = classifyToolRisk('mystery.action', {})
    expect(r.risk_level).toBe(4)
    expect(r.required_approvers).toContain('ceo')
  })
})

// ─────────────────────────────────────────────────
// SQL safety classifier
// ─────────────────────────────────────────────────
describe('classifySqlSafety', () => {
  it('clean ALTER TABLE is non-destructive', () => {
    const r = classifySqlSafety('ALTER TABLE foo ADD COLUMN bar text;')
    expect(r.is_destructive).toBe(false)
    expect(r.risk_level).toBeLessThanOrEqual(2)
  })

  it('DROP TABLE flagged destructive', () => {
    expect(classifySqlSafety('DROP TABLE users;').is_destructive).toBe(true)
  })

  it('TRUNCATE flagged destructive', () => {
    expect(classifySqlSafety('TRUNCATE users CASCADE;').is_destructive).toBe(true)
  })

  it('DELETE FROM x; without WHERE flagged destructive', () => {
    expect(classifySqlSafety('DELETE FROM users;').is_destructive).toBe(true)
  })

  it('DELETE FROM x WHERE id=1 not flagged', () => {
    expect(classifySqlSafety('DELETE FROM users WHERE id = 1;').is_destructive).toBe(false)
  })

  it('ALTER POLICY flagged destructive', () => {
    expect(classifySqlSafety('ALTER POLICY foo ON bar USING (true);').is_destructive).toBe(true)
  })

  it('CREATE TABLE without IF NOT EXISTS adds advisory flag', () => {
    const r = classifySqlSafety('CREATE TABLE foo (id int);')
    expect(r.flags).toContain('create_table_without_if_not_exists')
  })

  it('hasRollbackSection detects -- rollback comment', () => {
    expect(hasRollbackSection('CREATE TABLE x (id int);\n-- rollback: DROP TABLE x;')).toBe(true)
    expect(hasRollbackSection('CREATE TABLE x (id int);')).toBe(false)
  })

  it('hasVerifySection detects -- verify comment', () => {
    expect(hasVerifySection('-- verify: SELECT 1;')).toBe(true)
    expect(hasVerifySection('CREATE TABLE x (id int);')).toBe(false)
  })
})

// ─────────────────────────────────────────────────
// Migration bundle contract
// ─────────────────────────────────────────────────
describe('createMigrationBundle', () => {
  it('produces forward + rollback + verify file names', () => {
    const b = createMigrationBundle({
      name: 'add user prefs',
      forward_sql: 'ALTER TABLE users ADD COLUMN prefs jsonb;',
      rollback_sql: 'ALTER TABLE users DROP COLUMN prefs;',
      verify_sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'users';",
    })
    expect(b.forward.filename).toMatch(/_add_user_prefs\.forward\.sql$/)
    expect(b.rollback.filename).toMatch(/\.rollback\.sql$/)
    expect(b.verify.filename).toMatch(/\.verify\.sql$/)
  })

  it('is_safe_to_apply_staging only when rollback + verify provided', () => {
    const safe = createMigrationBundle({
      name: 'm1', forward_sql: 'ALTER TABLE x ADD COLUMN y text;',
      rollback_sql: 'ALTER TABLE x DROP COLUMN y;',
      verify_sql: 'SELECT 1;',
    })
    expect(safe.is_safe_to_apply_staging).toBe(true)

    const noRollback = createMigrationBundle({
      name: 'm2', forward_sql: 'ALTER TABLE x ADD COLUMN y text;',
      verify_sql: 'SELECT 1;',
    })
    expect(noRollback.is_safe_to_apply_staging).toBe(false)
  })

  it('production apply always blocked (CEO flow only)', () => {
    const b = createMigrationBundle({
      name: 'm', forward_sql: 'ALTER TABLE x ADD COLUMN y text;',
      rollback_sql: 'x;', verify_sql: 'x;',
    })
    expect(b.is_safe_to_apply_production).toBe(false)
  })

  it('destructive SQL pulls required_approvers to ceo', () => {
    const b = createMigrationBundle({
      name: 'wipe', forward_sql: 'DROP TABLE users;',
    })
    expect(b.safety.is_destructive).toBe(true)
    expect(b.required_approvers).toContain('ceo')
  })

  it('validateMigrationContract reports missing rollback/verify', () => {
    const v = validateMigrationContract({
      name: 'x', forward_sql: 'ALTER TABLE foo ADD COLUMN bar text;',
    })
    expect(v.ok).toBe(false)
    expect(v.missing).toContain('rollback_sql')
    expect(v.missing).toContain('verify_sql')
  })
})

// ─────────────────────────────────────────────────
// Model router routing for tool tasks
// ─────────────────────────────────────────────────
describe('routeModelForTask', () => {
  // These tests are deterministic based on env. Without OPENAI_API_KEY,
  // QA / research routes fall back to Claude, but engineering/migration_draft
  // always go to Claude regardless.
  it('engineering → Claude', () => {
    expect(routeModelForTask('engineering').provider).toBe('anthropic')
  })
  it('architecture → Claude', () => {
    expect(routeModelForTask('architecture').provider).toBe('anthropic')
  })
  it('debug → Claude', () => {
    expect(routeModelForTask('debug').provider).toBe('anthropic')
  })
  it('migration_draft → Claude', () => {
    expect(routeModelForTask('migration_draft').provider).toBe('anthropic')
  })
  it('qa returns one of the configured providers', () => {
    const p = routeModelForTask('qa').provider
    expect(['anthropic', 'openai']).toContain(p)
  })
  it('research returns one of the configured providers', () => {
    const p = routeModelForTask('research').provider
    expect(['anthropic', 'openai']).toContain(p)
  })
})
