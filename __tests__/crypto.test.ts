import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptSecret, decryptSecret, isEncrypted,
  encryptSecretFields, decryptSecretFields, maskSecretFields,
} from '@/lib/crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)  // 32 bytes hex
})

describe('crypto.encryptSecret', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const original = 'ghp_secret_token_xyz_123'
    const enc = encryptSecret(original)
    expect(enc).toMatch(/^enc:v1:/)
    expect(enc).not.toContain(original)
    expect(decryptSecret(enc)).toBe(original)
  })

  it('handles empty string', () => {
    expect(encryptSecret('')).toBe('')
    expect(decryptSecret('')).toBe('')
  })

  it('passes through legacy plaintext on decrypt', () => {
    expect(decryptSecret('plaintext_token')).toBe('plaintext_token')
  })

  it('is idempotent: encrypting an already-encrypted value returns the same value', () => {
    const enc = encryptSecret('foo')
    expect(encryptSecret(enc)).toBe(enc)
  })

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const a = encryptSecret('same')
    const b = encryptSecret('same')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same')
    expect(decryptSecret(b)).toBe('same')
  })

  it('isEncrypted detects format correctly', () => {
    expect(isEncrypted('enc:v1:abc:def:ghi')).toBe(true)
    expect(isEncrypted('plaintext')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted(undefined as unknown as string)).toBe(false)
  })
})

describe('crypto.encryptSecretFields', () => {
  it('encrypts only secret-named keys', () => {
    const cfg = { access_token: 'tok', repo: 'foo/bar', api_key: 'k', name: 'x' }
    const enc = encryptSecretFields(cfg)
    expect(enc.access_token).toMatch(/^enc:v1:/)
    expect(enc.api_key).toMatch(/^enc:v1:/)
    expect(enc.repo).toBe('foo/bar')
    expect(enc.name).toBe('x')
  })

  it('round-trips with decryptSecretFields', () => {
    const orig = { access_token: 'tok', repo: 'foo/bar', service_role_key: 'srk' }
    const round = decryptSecretFields(encryptSecretFields(orig))
    expect(round).toEqual(orig)
  })

  it('skips empty secret values', () => {
    const cfg = { access_token: '', repo: 'r' }
    const enc = encryptSecretFields(cfg)
    expect(enc.access_token).toBe('')
  })
})

describe('crypto.maskSecretFields', () => {
  it('masks all secret-shaped fields with bullets', () => {
    const cfg = { access_token: 'real-token', repo: 'r', api_key: 'k' }
    const masked = maskSecretFields(cfg)
    expect(masked.access_token).toBe('••••••••')
    expect(masked.api_key).toBe('••••••••')
    expect(masked.repo).toBe('r')
  })

  it('masks empty secret as empty string', () => {
    const cfg = { access_token: '' }
    expect(maskSecretFields(cfg).access_token).toBe('')
  })
})
