import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { isAdmin, adminCount } from '@/lib/admin'

const original = process.env.ADMIN_USER_IDS

describe('admin authorization', () => {
  beforeEach(() => { delete process.env.ADMIN_USER_IDS })
  afterAll(() => { process.env.ADMIN_USER_IDS = original })

  it('returns false when ADMIN_USER_IDS env not set', () => {
    expect(isAdmin('any-uuid')).toBe(false)
  })

  it('returns false for null/undefined user', () => {
    process.env.ADMIN_USER_IDS = 'a,b,c'
    expect(isAdmin(null)).toBe(false)
    expect(isAdmin(undefined)).toBe(false)
    expect(isAdmin('')).toBe(false)
  })

  it('matches single admin id', () => {
    process.env.ADMIN_USER_IDS = 'admin-uuid-1'
    expect(isAdmin('admin-uuid-1')).toBe(true)
    expect(isAdmin('other-uuid')).toBe(false)
  })

  it('matches one of multiple admin ids', () => {
    process.env.ADMIN_USER_IDS = 'a,b,c'
    expect(isAdmin('b')).toBe(true)
    expect(isAdmin('d')).toBe(false)
  })

  it('handles whitespace in env var', () => {
    process.env.ADMIN_USER_IDS = ' a , b , c '
    expect(isAdmin('a')).toBe(true)
    expect(isAdmin('c')).toBe(true)
  })

  it('adminCount reports number of configured admins', () => {
    process.env.ADMIN_USER_IDS = 'a,b,c'
    expect(adminCount()).toBe(3)
    process.env.ADMIN_USER_IDS = ''
    expect(adminCount()).toBe(0)
    delete process.env.ADMIN_USER_IDS
    expect(adminCount()).toBe(0)
  })
})
