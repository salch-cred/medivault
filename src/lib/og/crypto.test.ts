import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  deriveRecordKey,
  recordKey,
  newRecordSalt,
  saltToHex,
  deriveStreamId,
  contentHashHex,
  kvKeyBytes,
  KV_INDEX_LIST_KEY,
} from './crypto'

describe('crypto utilities', () => {
  describe('newRecordSalt / saltToHex / round-trip', () => {
    it('generates a 16-byte salt', () => {
      const salt = newRecordSalt()
      expect(salt).toBeInstanceOf(Uint8Array)
      expect(salt.byteLength).toBe(16)
    })

    it('round-trips salt through hex encoding', () => {
      const salt = newRecordSalt()
      const hex = saltToHex(salt)
      expect(hex).toMatch(/^[0-9a-f]{32}$/) // 16 bytes = 32 hex chars
      // Decode back and compare
      const decoded = new Uint8Array(hex.length / 2)
      for (let i = 0; i < decoded.length; i++) {
        decoded[i] = parseInt(hex.substr(i * 2, 2), 16)
      }
      expect(decoded).toEqual(salt)
    })

    it('produces different salts each call', () => {
      const s1 = newRecordSalt()
      const s2 = newRecordSalt()
      expect(s1).not.toEqual(s2)
    })
  })

  describe('deriveRecordKey', () => {
    it('derives a 32-byte AES key from master key + salt', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const salt = newRecordSalt()
      const derived = await deriveRecordKey(masterKey, salt)
      expect(derived).toBeInstanceOf(Uint8Array)
      expect(derived.byteLength).toBe(32)
    })

    it('derives different keys for different salts', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const salt1 = newRecordSalt()
      const salt2 = newRecordSalt()
      const key1 = await deriveRecordKey(masterKey, salt1)
      const key2 = await deriveRecordKey(masterKey, salt2)
      expect(key1).not.toEqual(key2)
    })

    it('derives same key for same inputs', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const salt = newRecordSalt()
      const key1 = await deriveRecordKey(masterKey, salt)
      const key2 = await deriveRecordKey(masterKey, salt)
      expect(key1).toEqual(key2)
    })

    it('throws on wrong master key length', async () => {
      const badKey = new Uint8Array(16)
      const salt = newRecordSalt()
      await expect(deriveRecordKey(badKey, salt)).rejects.toThrow('master key must be 32 bytes')
    })

    it('throws on wrong salt length', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const badSalt = new Uint8Array(8)
      await expect(deriveRecordKey(masterKey, badSalt)).rejects.toThrow('salt must be 16 bytes')
    })
  })

  describe('recordKey (legacy path)', () => {
    it('returns master key directly when no salt is provided', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const key = await recordKey(masterKey, undefined)
      expect(key).toEqual(masterKey)
    })

    it('returns master key directly when salt is null', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const key = await recordKey(masterKey, null)
      expect(key).toEqual(masterKey)
    })

    it('derives per-record key when salt is provided', async () => {
      const masterKey = crypto.getRandomValues(new Uint8Array(32))
      const salt = saltToHex(newRecordSalt())
      const key = await recordKey(masterKey, salt)
      expect(key).not.toEqual(masterKey)
      expect(key.byteLength).toBe(32)
    })
  })

  describe('deriveStreamId', () => {
    it('produces a 0x-prefixed keccak256 hash', () => {
      const id = deriveStreamId('0x' + 'ab'.repeat(20))
      expect(id).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('produces same id for same address regardless of case', () => {
      const id1 = deriveStreamId('0x' + 'ab'.repeat(20))
      const id2 = deriveStreamId('0x' + 'AB'.repeat(20))
      expect(id1).toBe(id2)
    })

    it('produces different ids for different addresses', () => {
      const id1 = deriveStreamId('0x' + 'ab'.repeat(20))
      const id2 = deriveStreamId('0x' + 'cd'.repeat(20))
      expect(id1).not.toBe(id2)
    })
  })

  describe('contentHashHex', () => {
    it('produces a keccak256 hash of the input bytes', () => {
      const data = new TextEncoder().encode('Hello, MediVault!')
      const hash = contentHashHex(data)
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      // Verify it matches ethers keccak256
      expect(hash).toBe(ethers.keccak256(data))
    })

    it('produces different hashes for different inputs', () => {
      const h1 = contentHashHex(new TextEncoder().encode('A'))
      const h2 = contentHashHex(new TextEncoder().encode('B'))
      expect(h1).not.toBe(h2)
    })
  })

  describe('kvKeyBytes', () => {
    it('encodes a string as UTF-8 bytes', () => {
      const bytes = kvKeyBytes('hello')
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(bytes)).toBe('hello')
    })
  })

  it('KV_INDEX_LIST_KEY is a non-empty string', () => {
    expect(KV_INDEX_LIST_KEY).toBeTruthy()
    expect(typeof KV_INDEX_LIST_KEY).toBe('string')
  })
})
