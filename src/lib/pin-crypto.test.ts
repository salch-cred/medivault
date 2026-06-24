/**
 * Tests for src/lib/pin-crypto.ts
 *
 * Web Crypto API is available in vitest's jsdom/happy-dom environment.
 * We test the full encrypt/decrypt pipeline, wrong-PIN rejection, v1 legacy
 * format, URL-safe base64, and payload validation.
 */
import { describe, it, expect } from 'vitest'
import { encryptWithPin, decryptWithPin } from './pin-crypto'

describe('PIN crypto', () => {
  describe('encryptWithPin / decryptWithPin round-trip', () => {
    it('encrypts and decrypts plain text', async () => {
      const plain = 'Hello, MediVault!'
      const pin = '1234'
      const encrypted = await encryptWithPin(plain, pin)
      const decrypted = await decryptWithPin(encrypted, pin)
      expect(decrypted).toBe(plain)
    })

    it('round-trips an empty string', async () => {
      const encrypted = await encryptWithPin('', '0000')
      const decrypted = await decryptWithPin(encrypted, '0000')
      expect(decrypted).toBe('')
    })

    it('round-trips unicode / emoji content', async () => {
      const plain = '血液検査 🩺 résumé \u2014 MediVault'
      const encrypted = await encryptWithPin(plain, '9999')
      const decrypted = await decryptWithPin(encrypted, '9999')
      expect(decrypted).toBe(plain)
    })

    it('round-trips a long string (> 1 KB)', async () => {
      const plain = 'a'.repeat(2048)
      const encrypted = await encryptWithPin(plain, 'long-pin')
      const decrypted = await decryptWithPin(encrypted, 'long-pin')
      expect(decrypted).toBe(plain)
    })

    it('produces different ciphertexts for the same plaintext (random IV+salt)', async () => {
      const enc1 = await encryptWithPin('same', '1234')
      const enc2 = await encryptWithPin('same', '1234')
      expect(enc1).not.toBe(enc2)
    })
  })

  describe('wrong PIN rejection', () => {
    it('throws on wrong PIN', async () => {
      const encrypted = await encryptWithPin('secret', '1234')
      await expect(decryptWithPin(encrypted, '9999')).rejects.toThrow(
        'Incorrect PIN or corrupted data',
      )
    })

    it('throws on empty PIN when originally encrypted with non-empty PIN', async () => {
      const encrypted = await encryptWithPin('secret', '1234')
      await expect(decryptWithPin(encrypted, '')).rejects.toThrow()
    })
  })

  describe('URL-safe base64 output', () => {
    it('output contains no +, /, or = characters', async () => {
      // Encrypt many times to exercise all base64 padding patterns
      for (let i = 0; i < 20; i++) {
        const enc = await encryptWithPin(`payload-${i}`, 'pin')
        expect(enc).not.toContain('+')
        expect(enc).not.toContain('/')
        expect(enc).not.toContain('=')
      }
    })
  })

  describe('v2 format magic byte', () => {
    it('encrypted payload starts with the v2 magic byte 0x02', async () => {
      const enc = await encryptWithPin('test', '1234')
      // Restore standard base64 to decode
      let b64 = enc.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      expect(decoded[0]).toBe(0x02)
    })

    it('embedded iteration count matches PBKDF2_ITERATIONS (600k)', async () => {
      const enc = await encryptWithPin('test', '1234')
      let b64 = enc.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      // Bytes 1-4: big-endian uint32 iteration count
      const iterations =
        (decoded[1] * 0x1000000) +
        ((decoded[2] << 16) | (decoded[3] << 8) | decoded[4])
      expect(iterations).toBe(600_000)
    })
  })

  describe('tampered payload detection', () => {
    it('throws on a truncated payload', async () => {
      const enc = await encryptWithPin('test', '1234')
      // Truncate to only first 10 chars of base64 — too short
      await expect(decryptWithPin(enc.slice(0, 10), '1234')).rejects.toThrow()
    })

    it('throws when ciphertext bytes are flipped (AES-GCM MAC failure)', async () => {
      const enc = await encryptWithPin('hello', '1234')
      let b64 = enc.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      // Flip last byte of ciphertext (AEAD tag area)
      bytes[bytes.length - 1] ^= 0xff
      const tampered = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      await expect(decryptWithPin(tampered, '1234')).rejects.toThrow(
        'Incorrect PIN or corrupted data',
      )
    })
  })

  describe('v1 legacy format decode', () => {
    it('decrypts a v1 payload (salt+iv+ct @ 100k iterations)', async () => {
      // Manually construct a v1 payload with 100k PBKDF2 iterations
      const pin = '1234'
      const plain = 'legacy record'
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))

      // Derive key with legacy 100k iterations
      const enc = new TextEncoder()
      const km = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveKey'])
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
        km,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
      )
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))

      // Pack as v1: salt(16) + iv(12) + ct (NO magic byte, NO iteration count)
      const packed = new Uint8Array(16 + 12 + ct.length)
      packed.set(salt, 0)
      packed.set(iv, 16)
      packed.set(ct, 28)

      const b64 = btoa(String.fromCharCode(...packed))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      const decrypted = await decryptWithPin(b64, pin)
      expect(decrypted).toBe(plain)
    })
  })
})
