#!/usr/bin/env node
/**
 * Encryption key rotation script (V1.7)
 *
 * Re-encrypts all `tool_integrations.config` secrets from OLD_ENCRYPTION_KEY → NEW_ENCRYPTION_KEY.
 * Self-contained ESM script — no project imports, runs with plain `node`.
 *
 * Usage:
 *   OLD_ENCRYPTION_KEY=<current_64hex> \
 *   NEW_ENCRYPTION_KEY=<new_64hex> \
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/rotate-encryption-key.mjs [--dry-run]
 *
 * Or via npm script:
 *   npm run rotate-key -- --dry-run     # preview
 *   npm run rotate-key                  # commit
 *
 * Steps after running successfully:
 *   1. Update Vercel env: ENCRYPTION_KEY = <NEW_ENCRYPTION_KEY>
 *   2. Update local .env.local: ENCRYPTION_KEY = <NEW_ENCRYPTION_KEY>
 *   3. Redeploy
 *   4. Verify /system-readiness shows "production-secure"
 */
import * as crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'
const SECRET_KEY_PATTERN = /token|secret|password|api[-_]?key|service[-_]?role/i

const dryRun = process.argv.includes('--dry-run')

function fail(msg) {
  console.error('✗', msg)
  process.exit(1)
}

const oldKeyHex = process.env.OLD_ENCRYPTION_KEY
const newKeyHex = process.env.NEW_ENCRYPTION_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!oldKeyHex || !/^[0-9a-f]{64}$/i.test(oldKeyHex)) fail('OLD_ENCRYPTION_KEY 必须是 64 位 hex')
if (!newKeyHex || !/^[0-9a-f]{64}$/i.test(newKeyHex)) fail('NEW_ENCRYPTION_KEY 必须是 64 位 hex')
if (oldKeyHex === newKeyHex)                          fail('OLD 和 NEW 不能相同')
if (!supabaseUrl) fail('需要 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_URL')
if (!serviceKey)  fail('需要 SUPABASE_SERVICE_ROLE_KEY（仅运维使用，不要泄漏）')

const OLD = Buffer.from(oldKeyHex, 'hex')
const NEW = Buffer.from(newKeyHex, 'hex')

// ─── crypto primitives (mirror src/lib/crypto.ts) ───────────────
function isEncrypted(v) { return typeof v === 'string' && v.startsWith(PREFIX) }
function decrypt(value, key) {
  if (!isEncrypted(value)) return value
  const [ivHex, tagHex, ctHex] = value.slice(PREFIX.length).split(':')
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
}
function encrypt(plaintext, key) {
  if (!plaintext) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex')
}

// ─── execute ────────────────────────────────────────────────────
console.log(`\n🔐 Encryption Key Rotation`)
console.log(`   ${dryRun ? '⊘ DRY RUN (no DB writes)' : '✓ COMMIT MODE (writes to DB)'}`)
console.log(`   Supabase: ${supabaseUrl}\n`)

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const { data: rows, error } = await supabase
  .from('tool_integrations')
  .select('id, user_id, tool_name, config')

if (error) fail(`查询失败：${error.message}`)
console.log(`扫描到 ${rows.length} 个 tool_integrations 记录...\n`)

let touchedRows = 0
let rotatedFields = 0
let skippedFields = 0
let errorRows = 0

for (const row of rows) {
  const cfg = row.config ?? {}
  const newCfg = { ...cfg }
  let touched = false

  for (const [k, v] of Object.entries(cfg)) {
    if (!SECRET_KEY_PATTERN.test(k)) continue
    if (typeof v !== 'string' || v.length === 0) continue
    if (!isEncrypted(v)) {
      console.log(`  ⊘ ${row.id} field "${k}" looks like plaintext — skipping (rerun /tools save to encrypt)`)
      skippedFields++
      continue
    }
    try {
      const plain = decrypt(v, OLD)
      newCfg[k] = encrypt(plain, NEW)
      rotatedFields++
      touched = true
    } catch (e) {
      console.log(`  ✗ ${row.id} field "${k}" decrypt failed: ${e.message}`)
      errorRows++
    }
  }

  if (touched) {
    if (dryRun) {
      console.log(`  ✓ ${row.id} (${row.tool_name}) — would rotate ${Object.keys(cfg).filter(k => SECRET_KEY_PATTERN.test(k)).length} field(s)`)
    } else {
      const { error: upErr } = await supabase
        .from('tool_integrations').update({ config: newCfg }).eq('id', row.id)
      if (upErr) {
        console.log(`  ✗ ${row.id} update failed: ${upErr.message}`)
        errorRows++
      } else {
        console.log(`  ✓ ${row.id} (${row.tool_name}) rotated`)
        touchedRows++
      }
    }
  }
}

console.log(`\n────────────────────────────`)
console.log(`总计：`)
console.log(`  rows scanned:  ${rows.length}`)
console.log(`  rows touched:  ${dryRun ? rotatedFields > 0 ? '(dry-run)' : 0 : touchedRows}`)
console.log(`  fields rotated: ${rotatedFields}`)
console.log(`  fields skipped: ${skippedFields}`)
console.log(`  errors:         ${errorRows}`)

if (dryRun) {
  console.log(`\n💡 Re-run without --dry-run to commit.\n`)
} else {
  console.log(`\n✅ Done. Next steps:`)
  console.log(`   1. Update Vercel env ENCRYPTION_KEY = ${newKeyHex.slice(0, 8)}...${newKeyHex.slice(-4)}`)
  console.log(`   2. Update local .env.local`)
  console.log(`   3. Redeploy`)
  console.log(`   4. Verify /system-readiness shows green\n`)
}

process.exit(errorRows > 0 ? 1 : 0)
