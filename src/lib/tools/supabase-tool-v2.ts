import { classifySqlSafety, hasRollbackSection, hasVerifySection } from './sql-safety'

// ─────────────────────────────────────────────────
// V2.2 — Supabase tool extensions (pure helpers)
// These wrap createMigrationFile / validateSql with safety contracts.
// They are pure functions, designed to be invoked from supabase-tool.ts
// or directly by the agent runtime; they do NOT touch the network.
// ─────────────────────────────────────────────────

export interface MigrationBundle {
  filename: string
  forward: { filename: string; sql: string }
  rollback: { filename: string; sql: string }
  verify: { filename: string; sql: string }
  safety: ReturnType<typeof classifySqlSafety>
  is_safe_to_apply_staging: boolean
  is_safe_to_apply_production: boolean
  required_approvers: string[]
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}

export interface CreateMigrationBundleInput {
  name: string
  forward_sql: string
  rollback_sql?: string
  verify_sql?: string
}

export function createMigrationBundle(input: CreateMigrationBundleInput): MigrationBundle {
  if (!input?.name) throw new Error('name required')
  if (!input?.forward_sql) throw new Error('forward_sql required')

  const ts = timestamp()
  const slug = safeName(input.name)
  const base = `${ts}_${slug}`

  const safety = classifySqlSafety(input.forward_sql)

  const rollback_sql = input.rollback_sql ?? ''
  const verify_sql = input.verify_sql ?? ''

  // Safety contracts:
  // - Any forward migration must ship with rollback + verify SQL.
  // - Destructive forward SQL → only CEO may apply (production blocked).
  const has_rollback = !!rollback_sql.trim() || hasRollbackSection(input.forward_sql)
  const has_verify   = !!verify_sql.trim() || hasVerifySection(input.forward_sql)

  const is_safe_to_apply_staging = has_rollback && has_verify && !safety.is_destructive
  const is_safe_to_apply_production = false // always require CEO via separate flow

  const required_approvers: string[] = []
  if (safety.is_destructive) required_approvers.push('ceo')
  else {
    required_approvers.push('engineering_manager', 'qa_manager')
  }

  return {
    filename: `${base}.sql`,
    forward:  { filename: `${base}.forward.sql`,  sql: input.forward_sql },
    rollback: { filename: `${base}.rollback.sql`, sql: rollback_sql },
    verify:   { filename: `${base}.verify.sql`,   sql: verify_sql },
    safety,
    is_safe_to_apply_staging,
    is_safe_to_apply_production,
    required_approvers,
  }
}

export function validateMigrationContract(input: CreateMigrationBundleInput): {
  ok: boolean
  missing: string[]
  reasons: string[]
} {
  const missing: string[] = []
  const reasons: string[] = []
  if (!input.forward_sql) missing.push('forward_sql')
  if (!input.rollback_sql && !hasRollbackSection(input.forward_sql ?? ''))
    missing.push('rollback_sql')
  if (!input.verify_sql && !hasVerifySection(input.forward_sql ?? ''))
    missing.push('verify_sql')

  const safety = input.forward_sql ? classifySqlSafety(input.forward_sql) : null
  if (safety?.is_destructive) reasons.push('destructive_sql_detected')

  return { ok: missing.length === 0, missing, reasons }
}
