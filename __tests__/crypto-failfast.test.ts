import { describe, it, expect, afterEach, vi } from 'vitest'

// crypto.ts caches the key at module scope, so each scenario re-imports fresh.
const ORIG = { KEY: process.env.ENCRYPTION_KEY }

afterEach(() => {
  vi.unstubAllEnvs()
  if (ORIG.KEY === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = ORIG.KEY
  vi.resetModules()
})

describe('ENCRYPTION_KEY fail-fast (P1-2)', () => {
  it('throws in production when ENCRYPTION_KEY is missing', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.ENCRYPTION_KEY
    const { encryptSecretFields } = await import('@/lib/crypto')
    expect(() => encryptSecretFields({ access_token: 'x' })).toThrow(/ENCRYPTION_KEY is required/)
  })

  it('throws in production when ENCRYPTION_KEY is too short', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    process.env.ENCRYPTION_KEY = 'deadbeef' // not 64 hex chars
    const { encryptSecretFields } = await import('@/lib/crypto')
    expect(() => encryptSecretFields({ access_token: 'x' })).toThrow(/ENCRYPTION_KEY is required/)
  })

  it('works in production with a valid 64-hex key', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    const { encryptSecretFields, decryptSecretFields } = await import('@/lib/crypto')
    const enc = encryptSecretFields({ access_token: 'ghp_secret', name: 'plain' })
    expect(String(enc.access_token)).toMatch(/^enc:v1:/)
    expect(enc.name).toBe('plain') // non-secret field untouched
    const dec = decryptSecretFields(enc)
    expect(dec.access_token).toBe('ghp_secret')
  })

  it('dev mode falls back (warns) without throwing', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.ENCRYPTION_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { encryptSecretFields } = await import('@/lib/crypto')
    expect(() => encryptSecretFields({ access_token: 'x' })).not.toThrow()
    warn.mockRestore()
  })
})
