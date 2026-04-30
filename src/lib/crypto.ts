import * as crypto from 'crypto'

// ─────────────────────────────────────────────────
// AES-256-GCM secret encryption
// Format: enc:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
// ─────────────────────────────────────────────────
const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'
const SECRET_KEY_PATTERN = /token|secret|password|api[-_]?key|service[-_]?role/i

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const k = process.env.ENCRYPTION_KEY
  if (k && /^[0-9a-f]{64}$/i.test(k)) {
    cachedKey = Buffer.from(k, 'hex')
    return cachedKey
  }
  // Dev fallback — derived from a stable string. NOT secure for prod.
  if (process.env.NODE_ENV === 'production') {
    console.warn('[crypto] ENCRYPTION_KEY missing or invalid in production — secrets will use insecure fallback key. Set ENCRYPTION_KEY=$(openssl rand -hex 32)')
  }
  cachedKey = crypto.scryptSync('super-individual-os-dev-fallback', 'salt-v1', 32)
  return cachedKey
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (isEncrypted(plaintext)) return plaintext   // idempotent
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex')
}

export function decryptSecret(value: string): string {
  if (!value) return ''
  if (!isEncrypted(value)) return value          // legacy plaintext passthrough
  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 3) throw new Error('Malformed encrypted value')
  const [ivHex, tagHex, ctHex] = parts
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const plain = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()])
  return plain.toString('utf8')
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

// ─────────────────────────────────────────────────
// Field-level helpers for tool_integrations.config
// ─────────────────────────────────────────────────
export function encryptSecretFields(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && v.length > 0) {
      out[k] = encryptSecret(v)
    } else {
      out[k] = v
    }
  }
  return out
}

export function decryptSecretFields(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && v.length > 0) {
      try {
        out[k] = decryptSecret(v)
      } catch {
        // If decryption fails, leave as-is (might be plaintext from migration)
        out[k] = v
      }
    } else {
      out[k] = v
    }
  }
  return out
}

// ─────────────────────────────────────────────────
// V1.6: Environment guard + key version awareness
// ─────────────────────────────────────────────────
export type EncryptionKeyStatus = 'production-secure' | 'dev-fallback' | 'invalid'

export function getEncryptionKeyStatus(): { status: EncryptionKeyStatus; message: string } {
  const k = process.env.ENCRYPTION_KEY
  const isValid = !!k && /^[0-9a-f]{64}$/i.test(k)

  if (isValid) {
    return { status: 'production-secure', message: 'ENCRYPTION_KEY 已配置（32 字节 hex），密钥强度合格' }
  }
  if (process.env.NODE_ENV === 'production') {
    return {
      status: 'invalid',
      message: 'production 环境缺少有效 ENCRYPTION_KEY — 敏感工具连接已禁用。请运行 openssl rand -hex 32 生成密钥后设置环境变量',
    }
  }
  return {
    status: 'dev-fallback',
    message: '使用开发回退密钥（仅本地开发可用）— 部署到生产前必须设置 ENCRYPTION_KEY',
  }
}

/**
 * Throw if production environment is not safe for sensitive ops.
 * Call this in API endpoints that store secrets.
 */
export function assertProductionSafeKey(): void {
  const s = getEncryptionKeyStatus()
  if (s.status === 'invalid') {
    throw Object.assign(new Error(s.message), { code: 'encryption_key_missing', status: 503 })
  }
}

/** Active key version used by all new encryptions. Updated when rotating. */
export const ACTIVE_KEY_VERSION = 'v1' as const

export function getKeyVersion(value: string): string | null {
  if (!isEncrypted(value)) return null
  const m = value.match(/^enc:(v\d+):/)
  return m ? m[1] : null
}

export function maskSecretFields(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = (typeof v === 'string' && v.length > 0) ? '••••••••' : ''
    } else {
      out[k] = v
    }
  }
  return out
}
