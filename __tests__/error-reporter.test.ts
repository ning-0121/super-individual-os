import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportError, tryReport } from '@/lib/error-reporter'

describe('error-reporter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('logs Error instance with structured fields', () => {
    const spy = vi.spyOn(console, 'error')
    reportError(new Error('boom'), { user_id: 'u1', endpoint: '/api/x' })
    expect(spy).toHaveBeenCalled()
    const arg = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(arg)
    expect(parsed.event).toBe('error.reported')
    expect(parsed.error_message).toBe('boom')
    expect(parsed.user_id).toBe('u1')
    expect(parsed.endpoint).toBe('/api/x')
  })

  it('coerces non-Error to Error', () => {
    const spy = vi.spyOn(console, 'error')
    reportError('string error')
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed.error_message).toBe('string error')
  })

  it('tryReport returns the result on success', async () => {
    const result = await tryReport(async () => 42)
    expect(result).toBe(42)
  })

  it('tryReport returns null and reports on error', async () => {
    const spy = vi.spyOn(console, 'error')
    const result = await tryReport(async () => { throw new Error('fail') })
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
  })
})

describe('crypto.assertProductionSafeKey', () => {
  it('does not throw with valid ENCRYPTION_KEY in any env', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    const { assertProductionSafeKey } = await import('@/lib/crypto')
    expect(() => assertProductionSafeKey()).not.toThrow()
  })

  it('does not throw with invalid key in non-production env', async () => {
    process.env.ENCRYPTION_KEY = 'short'
    vi.stubEnv('NODE_ENV', 'test')
    const { assertProductionSafeKey } = await import('@/lib/crypto')
    expect(() => assertProductionSafeKey()).not.toThrow()
  })
})
