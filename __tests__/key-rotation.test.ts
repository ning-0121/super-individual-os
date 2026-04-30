import { describe, it, expect } from 'vitest'
import { encryptWithKey, decryptWithKey, isEncrypted } from '@/lib/crypto'
import * as crypto from 'crypto'

describe('key rotation primitives', () => {
  const oldKey = crypto.randomBytes(32)
  const newKey = crypto.randomBytes(32)

  it('decryptWithKey can decrypt what encryptWithKey produced', () => {
    const enc = encryptWithKey('secret-token', oldKey)
    expect(isEncrypted(enc)).toBe(true)
    expect(decryptWithKey(enc, oldKey)).toBe('secret-token')
  })

  it('decrypt with wrong key throws (auth tag fails)', () => {
    const enc = encryptWithKey('secret-token', oldKey)
    expect(() => decryptWithKey(enc, newKey)).toThrow()
  })

  it('full rotation round-trip: oldKey-decrypt → newKey-encrypt → newKey-decrypt', () => {
    const original = 'ghp_my_secret_token_xyz'
    const encOld = encryptWithKey(original, oldKey)

    // Simulate rotation
    const plaintext = decryptWithKey(encOld, oldKey)
    const encNew = encryptWithKey(plaintext, newKey)

    // After rotation, only newKey can decrypt
    expect(decryptWithKey(encNew, newKey)).toBe(original)
    expect(() => decryptWithKey(encNew, oldKey)).toThrow()

    // Old ciphertext is unaffected (oldKey still decrypts it)
    expect(decryptWithKey(encOld, oldKey)).toBe(original)
  })

  it('legacy plaintext passes through both encrypt/decrypt unchanged', () => {
    expect(decryptWithKey('plaintext', oldKey)).toBe('plaintext')
    // encryptWithKey on a non-encrypted plaintext encrypts it
    const enc = encryptWithKey('plaintext', oldKey)
    expect(isEncrypted(enc)).toBe(true)
  })
})
