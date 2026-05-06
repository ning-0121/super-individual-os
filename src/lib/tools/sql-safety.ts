// ─────────────────────────────────────────────────
// V2.2 — SQL safety classifier (pure, testable)
// Detects destructive / dangerous SQL patterns and assigns risk level.
// Used by the supabase tool gate and the manager auto-decider.
// ─────────────────────────────────────────────────

import type { RiskLevel } from '@/types'

export interface SqlSafetyReport {
  is_destructive: boolean
  is_safe: boolean
  risk_level: RiskLevel
  flags: string[]
  warnings: string[]
}

// L4 — irreversible / data-destroying / auth-altering
const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; flag: string; warning: string }> = [
  { re: /\bdrop\s+(database|schema)\s/i,
    flag: 'drop_db_or_schema',
    warning: '🔴 DROP DATABASE/SCHEMA — extremely destructive' },
  { re: /\bdrop\s+table\s+/i,
    flag: 'drop_table',
    warning: '🔴 DROP TABLE — destructive' },
  { re: /\btruncate\b/i,
    flag: 'truncate',
    warning: '🔴 TRUNCATE — instantly wipes data' },
  // DELETE without WHERE — match DELETE FROM <ident> followed by ; or end-of-statement
  { re: /\bdelete\s+from\s+[a-z_][a-z0-9_."]*\s*(;|$)/im,
    flag: 'delete_without_where',
    warning: '🔴 DELETE without WHERE — full-table delete' },
  { re: /\balter\s+policy\b/i,
    flag: 'alter_policy',
    warning: '🔴 ALTER POLICY — auth/RLS change' },
  { re: /\bdrop\s+policy\b/i,
    flag: 'drop_policy',
    warning: '🔴 DROP POLICY — auth/RLS change' },
  { re: /\bdrop\s+role\b/i,
    flag: 'drop_role',
    warning: '🔴 DROP ROLE — auth change' },
  { re: /\balter\s+(table|schema)\s+auth\./i,
    flag: 'alter_auth_schema',
    warning: '🔴 Modifying auth schema — destructive' },
]

// L1/L2 warnings — non-idempotent or lacks-safety-net patterns
const ADVISORY_PATTERNS: Array<{ re: RegExp; flag: string; warning: string }> = [
  { re: /\bcreate\s+table\s+(?!if\s+not\s+exists)/i,
    flag: 'create_table_without_if_not_exists',
    warning: '💡 CREATE TABLE without IF NOT EXISTS' },
  { re: /\balter\s+table\s+\w+\s+drop\s+column\s+(?!if\s+exists)/i,
    flag: 'drop_column_without_if_exists',
    warning: '⚠ DROP COLUMN without IF EXISTS' },
]

export function classifySqlSafety(sql: string): SqlSafetyReport {
  const flags: string[] = []
  const warnings: string[] = []

  if (!sql || typeof sql !== 'string') {
    return { is_destructive: false, is_safe: true, risk_level: 0, flags: [], warnings: [] }
  }

  for (const p of DESTRUCTIVE_PATTERNS) {
    if (p.re.test(sql)) { flags.push(p.flag); warnings.push(p.warning) }
  }
  for (const p of ADVISORY_PATTERNS) {
    if (p.re.test(sql)) { flags.push(p.flag); warnings.push(p.warning) }
  }

  // RLS reminder for new tables
  const hasNewTable = /\bcreate\s+table\b/i.test(sql)
  const hasRLS = /\benable\s+row\s+level\s+security/i.test(sql)
  if (hasNewTable && !hasRLS) {
    flags.push('new_table_without_rls')
    warnings.push('⚠ Created table without ENABLE ROW LEVEL SECURITY')
  }

  const is_destructive = DESTRUCTIVE_PATTERNS.some(p => p.re.test(sql))
  let risk_level: RiskLevel = 0
  if (is_destructive)                    risk_level = 4
  else if (flags.includes('drop_column_without_if_exists') ||
           flags.includes('new_table_without_rls'))    risk_level = 2
  else if (flags.length > 0)             risk_level = 1

  return {
    is_destructive,
    is_safe: !is_destructive,
    risk_level,
    flags,
    warnings,
  }
}

// Migration-specific check: did the author include a rollback + verify section?
export function hasRollbackSection(sql: string): boolean {
  if (!sql) return false
  return /--\s*(rollback|down|revert)\b/i.test(sql) || /\b(begin|transaction)\b.*\brollback\b/i.test(sql)
}

export function hasVerifySection(sql: string): boolean {
  if (!sql) return false
  return /--\s*(verify|check|assert)\b/i.test(sql)
}
