import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  canonicalClaim,
  claimDigest,
  claimMessage,
  verifyProof,
  encodeProof,
  decodeProof,
  type DisclosureClaim,
  type DisclosureProof,
} from './disclosure'

describe('disclosure proofs', () => {
  function makeClaim(overrides: Partial<DisclosureClaim> = {}): DisclosureClaim {
    return {
      v: 1,
      issuer: ethers.Wallet.createRandom().address,
      recordTitle: 'Lab Report',
      docType: 'lab_report',
      recordRootHash: '0x' + 'ab'.repeat(32),
      fields: [{ label: 'HbA1c', value: '5.8%' }],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      nonce: 'nonce_' + Math.random().toString(36).slice(2),
      ...overrides,
    }
  }

  describe('canonicalClaim', () => {
    it('produces JSON with ordered keys', () => {
      const claim = makeClaim()
      const canon = canonicalClaim(claim)
      const parsed = JSON.parse(canon)
      const keys = Object.keys(parsed)
      expect(keys[0]).toBe('v')
      expect(keys[1]).toBe('issuer')
      expect(keys[2]).toBe('recordTitle')
    })

    it('lowercases the issuer address', () => {
      const claim = makeClaim({ issuer: '0x' + 'AB'.repeat(20) })
      const canon = canonicalClaim(claim)
      expect(canon).toContain('0x' + 'ab'.repeat(20))
    })
  })

  describe('claimDigest', () => {
    it('produces a 0x-prefixed keccak256 hash', () => {
      const claim = makeClaim()
      const digest = claimDigest(claim)
      expect(digest).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('produces same digest for same claim', () => {
      const claim = makeClaim()
      expect(claimDigest(claim)).toBe(claimDigest(claim))
    })
  })

  describe('claimMessage', () => {
    it('produces a human-readable message with key details', () => {
      const claim = makeClaim({
        recordTitle: 'Blood Test',
        recordRootHash: '0x' + 'cd'.repeat(32),
      })
      const msg = claimMessage(claim)
      expect(msg).toContain('MediVault selective-disclosure health proof')
      expect(msg).toContain('Blood Test')
      expect(msg).toContain('0x' + 'cd'.repeat(32))
      expect(msg).toContain('Digest:')
    })
  })

  describe('verifyProof', () => {
    it('verifies a valid signed proof', async () => {
      const wallet = ethers.Wallet.createRandom()
      const claim = makeClaim({ issuer: wallet.address })
      const sig = await wallet.signMessage(claimMessage(claim))
      const proof: DisclosureProof = { claim, signature: sig }
      const result = verifyProof(proof)
      expect(result.valid).toBe(true)
      expect(result.issuerMatches).toBe(true)
      expect(result.expired).toBe(false)
      expect(result.recovered?.toLowerCase()).toBe(wallet.address.toLowerCase())
    })

    it('rejects an expired proof', async () => {
      const wallet = ethers.Wallet.createRandom()
      const claim = makeClaim({
        issuer: wallet.address,
        issuedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      })
      const sig = await wallet.signMessage(claimMessage(claim))
      const result = verifyProof({ claim, signature: sig })
      expect(result.valid).toBe(false)
      expect(result.expired).toBe(true)
      expect(result.reason).toContain('expired')
    })

    it('rejects a proof signed by a different address', async () => {
      const wallet1 = ethers.Wallet.createRandom()
      const wallet2 = ethers.Wallet.createRandom()
      const claim = makeClaim({ issuer: wallet1.address })
      const sig = await wallet2.signMessage(claimMessage(claim)) // wrong signer
      const result = verifyProof({ claim, signature: sig })
      expect(result.valid).toBe(false)
      expect(result.issuerMatches).toBe(false)
    })

    it('accepts a proof with null expiration (never expires)', async () => {
      const wallet = ethers.Wallet.createRandom()
      const claim = makeClaim({ issuer: wallet.address, expiresAt: null })
      const sig = await wallet.signMessage(claimMessage(claim))
      const result = verifyProof({ claim, signature: sig })
      expect(result.valid).toBe(true)
      expect(result.expired).toBe(false)
    })

    it('rejects a malformed signature', () => {
      const claim = makeClaim()
      const result = verifyProof({ claim, signature: 'bad-signature' })
      expect(result.valid).toBe(false)
      expect(result.recovered).toBeNull()
    })
  })

  describe('encodeProof / decodeProof round-trip', () => {
    it('round-trips a proof through base64url encoding', async () => {
      const wallet = ethers.Wallet.createRandom()
      const claim = makeClaim({ issuer: wallet.address })
      const sig = await wallet.signMessage(claimMessage(claim))
      const proof: DisclosureProof = { claim, signature: sig }
      const encoded = encodeProof(proof)
      const decoded = decodeProof(encoded)
      expect(decoded).not.toBeNull()
      expect(decoded!.claim.issuer).toBe(claim.issuer)
      expect(decoded!.signature).toBe(sig)
    })

    it('returns null for invalid base64url', () => {
      expect(decodeProof('!!!invalid!!!')).toBeNull()
    })

    it('returns null for non-object JSON', () => {
      // Encode a string '"hello"' as base64url
      const b64 = Buffer.from(JSON.stringify('hello')).toString('base64url')
      expect(decodeProof(b64)).toBeNull()
    })
  })
})
