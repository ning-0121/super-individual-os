import type { ToolHandler } from './types'

interface SupabaseConfig {
  project_url?: string         // https://<ref>.supabase.co
  service_role_key?: string
}

// ─────────────────────────────────────────────────
// Pure local: createMigrationFile
// ─────────────────────────────────────────────────
interface CreateMigrationParams {
  name: string
  sql: string
}

function createMigrationFile(p: CreateMigrationParams) {
  if (!p?.name) throw new Error('name 必填（描述性文件名）')
  if (!p?.sql)  throw new Error('sql 必填（完整 SQL 内容）')

  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const safe = p.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  const filename = `${ts}_${safe}.sql`

  return {
    filename,
    sql: p.sql,
    suggested_path: `supabase/migrations/${filename}`,
    instructions: '将文件保存到 supabase/migrations/ 后用 Supabase CLI 或 Dashboard SQL Editor 执行',
    statement_count: p.sql.split(';').filter(s => s.trim().length > 0).length,
  }
}

// ─────────────────────────────────────────────────
// Pure local: validateSql
// ─────────────────────────────────────────────────
interface ValidateSqlParams {
  sql: string
}

function validateSql(p: ValidateSqlParams) {
  if (!p?.sql) throw new Error('sql 必填')
  const sql = p.sql
  const warnings: string[] = []

  if (/\bdrop\s+(database|schema)\s/i.test(sql))
    warnings.push('🔴 DROP DATABASE/SCHEMA — 极度危险')
  if (/\bdrop\s+table\s+(?!if\s+exists)/i.test(sql))
    warnings.push('⚠ DROP TABLE 不带 IF EXISTS — 不可重复执行且易出错')
  if (/\btruncate\b/i.test(sql))
    warnings.push('⚠ TRUNCATE — 数据将立即丢失')
  if (/\bdelete\s+from\s+\w+\s*;|delete\s+from\s+\w+\s*$/im.test(sql))
    warnings.push('⚠ DELETE 没有 WHERE — 会删除全表')
  if (/\balter\s+table\s+\w+\s+drop\s+column\s+(?!if\s+exists)/i.test(sql))
    warnings.push('⚠ DROP COLUMN 不带 IF EXISTS')

  if (/\bcreate\s+table\s+(?!if\s+not\s+exists)/i.test(sql))
    warnings.push('💡 建议 CREATE TABLE 加 IF NOT EXISTS')
  if (/\bcreate\s+policy\s+/i.test(sql) && !/\bdrop\s+policy\s+if\s+exists/i.test(sql))
    warnings.push('💡 CREATE POLICY 建议先 DROP POLICY IF EXISTS（提高幂等性）')

  const hasNewTable = /\bcreate\s+table\b/i.test(sql)
  const hasRLS = /\benable\s+row\s+level\s+security/i.test(sql)
  if (hasNewTable && !hasRLS)
    warnings.push('⚠ 新建表但未启用 RLS (ROW LEVEL SECURITY) — 安全风险')

  const isSafe = !warnings.some(w => w.startsWith('🔴') || w.startsWith('⚠'))

  return {
    char_count: sql.length,
    statement_count: sql.split(';').filter(s => s.trim().length > 0).length,
    warnings,
    is_safe: isSafe,
  }
}

// ─────────────────────────────────────────────────
// Network: listTables (validates connection)
// ─────────────────────────────────────────────────
async function listTables(cfg: SupabaseConfig) {
  if (!cfg?.project_url || !cfg?.service_role_key)
    throw new Error('需要 project_url 和 service_role_key 才能列出表')

  // Hit PostgREST root — returns 200 if auth OK
  const res = await fetch(`${cfg.project_url}/rest/v1/`, {
    headers: {
      'apikey': cfg.service_role_key,
      'Authorization': `Bearer ${cfg.service_role_key}`,
    },
  })
  if (!res.ok) throw new Error(`Supabase 连接失败：${res.status}`)

  return {
    project_url: cfg.project_url,
    note: 'V1.5: 仅验证连接。完整表清单需在 V1.6 通过 Management API 实现',
    connection: 'ok',
  }
}

// ─────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────
export const supabaseTool: ToolHandler = {
  describe() {
    return {
      actions: [
        {
          name: 'createMigrationFile',
          description: '生成可保存到 supabase/migrations/ 的 SQL 迁移文件（不执行）',
          params: ['name (描述性短名)', 'sql (完整 SQL 内容)'],
          example: { name: 'add-user-prefs', sql: 'ALTER TABLE users ADD COLUMN prefs jsonb;' },
        },
        {
          name: 'validateSql',
          description: '静态分析 SQL：识别 DROP/TRUNCATE/缺 RLS 等危险或非幂等模式',
          params: ['sql'],
          example: { sql: 'DROP TABLE foo;' },
        },
        {
          name: 'listTables',
          description: '验证 Supabase 连接（V1.5: 仅连通性；完整表清单 V1.6）',
          params: [],
        },
      ],
    }
  },

  async execute(action, params, config) {
    switch (action) {
      case 'createMigrationFile':
        return createMigrationFile(params as unknown as CreateMigrationParams)
      case 'validateSql':
        return validateSql(params as unknown as ValidateSqlParams)
      case 'listTables':
        return listTables(config as unknown as SupabaseConfig)
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  },

  async validateConfig(config) {
    const cfg = config as unknown as SupabaseConfig
    if (!cfg?.project_url) return { ok: true, message: '已保存（未提供 URL，仅本地工具可用）' }
    if (!cfg?.service_role_key) return { ok: false, message: '提供了 URL 但缺少 service_role_key' }
    try {
      const res = await fetch(`${cfg.project_url}/rest/v1/`, {
        headers: { 'apikey': cfg.service_role_key, 'Authorization': `Bearer ${cfg.service_role_key}` },
      })
      if (!res.ok) return { ok: false, message: `Supabase ${res.status}: ${(await res.text()).slice(0, 120)}` }
      return { ok: true, message: '✓ Supabase 连接成功' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '验证失败' }
    }
  },
}
