import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { isSentryConfigured } from '@/lib/error-reporter'

const original = process.env.SENTRY_DSN

describe('Sentry DSN parsing', () => {
  beforeEach(() => { delete process.env.SENTRY_DSN })
  afterAll(() => { process.env.SENTRY_DSN = original })

  it('returns false when DSN missing', () => {
    expect(isSentryConfigured()).toBe(false)
  })

  it('returns false for malformed DSN', () => {
    process.env.SENTRY_DSN = 'not-a-dsn'
    expect(isSentryConfigured()).toBe(false)
  })

  it('returns true for well-formed DSN', () => {
    process.env.SENTRY_DSN = 'https://abc123def456@o123456.ingest.sentry.io/9876543'
    expect(isSentryConfigured()).toBe(true)
  })

  it('returns true for self-hosted Sentry DSN', () => {
    process.env.SENTRY_DSN = 'https://publickey@sentry.example.com/42'
    expect(isSentryConfigured()).toBe(true)
  })
})
