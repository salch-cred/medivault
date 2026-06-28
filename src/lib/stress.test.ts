import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  recordKey,
  newRecordSalt,
  saltToHex,
} from './og/crypto'
import { eciesEncrypt, eciesDecrypt } from './og/ecies'
import {
  verifyProof,
  encodeProof,
  decodeProof,
  claimMessage,
} from './og/disclosure'
import {
  computeEntryHash,
  verifyConsentChain,
  GENESIS_HASH,
} from './og/ledger'
import type { ConsentEventCore } from './og/ledger'

describe('MediVault Hard Stress & Benchmark Tests', () => {
  // 1. Cryptographic Key Derivation Scaling Benchmark
  it('benchmarks deriving 100 distinct record keys via HKDF-SHA256', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32))
    const start = performance.now()

    for (let i = 0; i < 100; i++) {
      const salt = saltToHex(newRecordSalt())
      const derived = await recordKey(masterKey, salt)
      expect(derived).toHaveLength(32)
    }

    const duration = performance.now() - start
    console.log(`[Benchmark] Deriving 100 HKDF keys took: ${duration.toFixed(2)}ms`)
    expect(duration).toBeLessThan(1000) // Must derive 100 keys under 1 second
  })

  // 2. High Concurrency ECIES Sharing Stress Test
  it('handles 20 concurrent ECIES encryption and decryption operations', async () => {
    const recipientWallet = ethers.Wallet.createRandom()
    const publicKey = recipientWallet.publicKey
    const privateKey = recipientWallet.privateKey

    const payloads = Array.from({ length: 20 }, (_, i) => 
      new TextEncoder().encode(`Secure key payload value: ${i}`)
    )

    const start = performance.now()

    // Encrypt 20 payloads concurrently
    const envelopes = await Promise.all(
      payloads.map((payload) => eciesEncrypt(publicKey, payload))
    )
    expect(envelopes).toHaveLength(20)

    // Decrypt 20 envelopes concurrently
    const decryptedPayloads = await Promise.all(
      envelopes.map((env) => eciesDecrypt(privateKey, env))
    )

    const duration = performance.now() - start
    console.log(`[Benchmark] 20 concurrent ECIES ops took: ${duration.toFixed(2)}ms`)

    decryptedPayloads.forEach((decrypted, i) => {
      const originalText = new TextDecoder().decode(payloads[i])
      const decryptedText = new TextDecoder().decode(decrypted)
      expect(decryptedText).toBe(originalText)
    })
  })

  // 3. Deep Ledger Chain Verification Performance
  it('verifies integrity of a deep consent ledger (50 entries) and checks tampering at multiple points', () => {
    const genesisHash = GENESIS_HASH
    const ledger: any[] = []
    let lastHash = genesisHash

    // Build 50-entry chain
    for (let i = 0; i < 50; i++) {
      const entry: ConsentEventCore = {
        id: `id_${i}`,
        ts: new Date(Date.now() - (50 - i) * 60000).toISOString(),
        type: (i % 2 === 0 ? 'grant' : 'revoke') as 'grant' | 'revoke',
        actor: '0x' + 'aa'.repeat(20),
        recipient: '0x' + '12'.repeat(20),
        recordTitle: `Report ${i}`,
        recordRootHash: `0xhash_${i}`,
        prevHash: lastHash,
      }
      lastHash = computeEntryHash(entry)
      ledger.push({ ...entry, entryHash: lastHash })
    }

    const start = performance.now()
    const verifyResult = verifyConsentChain(ledger)
    const duration = performance.now() - start

    console.log(`[Benchmark] Verifying 50-entry ledger chain took: ${duration.toFixed(2)}ms`)
    expect(verifyResult.ok).toBe(true)
    expect(duration).toBeLessThan(100) // Verification must be sub-100ms

    // Test tampering at different parts of the chain (Beginning, Middle, End)
    const tamperIndices = [0, 25, 49]
    tamperIndices.forEach((index) => {
      const tamperedLedger = JSON.parse(JSON.stringify(ledger))
      tamperedLedger[index].recordTitle = 'malicious_tamper' // Modifying a field committed in hash
      
      const res = verifyConsentChain(tamperedLedger)
      expect(res.ok).toBe(false)
      expect(res.brokenAt).toBe(index)
    })
  })

  // 4. Selective Disclosure Proof Expiry & Edge Cases
  it('correctly flags expired or tampered selective disclosure proofs', async () => {
    const issuerWallet = ethers.Wallet.createRandom()

    // Case A: Expired Proof
    const expiredClaim = {
      v: 1 as const,
      issuer: issuerWallet.address,
      recordTitle: 'Expired Report',
      docType: 'lab_report' as const,
      recordRootHash: '0xabc',
      fields: [{ label: 'HbA1c', value: '5.8%' }],
      issuedAt: new Date(Date.now() - 7200 * 1000).toISOString(), // 2 hrs ago
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hr ago
      nonce: 'nonce_expired',
    }
    
    // Using verification functions:
    const expiredMsg = claimMessage(expiredClaim)
    const expiredSig = await issuerWallet.signMessage(expiredMsg)
    const expiredProof = { claim: expiredClaim, signature: expiredSig }
    const expiredEncoded = encodeProof(expiredProof)
    const expiredDecoded = decodeProof(expiredEncoded)

    const verificationExpired = verifyProof(expiredDecoded!)
    expect(verificationExpired.valid).toBe(false)
    expect(verificationExpired.expired).toBe(true)
    expect(verificationExpired.reason).toContain('expired')

    // Case B: Tampered Signature
    const normalClaim = {
      v: 1 as const,
      issuer: issuerWallet.address,
      recordTitle: 'Normal Report',
      docType: 'lab_report' as const,
      recordRootHash: '0xabc',
      fields: [{ label: 'HbA1c', value: '5.8%' }],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      nonce: 'nonce_normal',
    }

    const normalMsg = claimMessage(normalClaim)
    const normalSig = await issuerWallet.signMessage(normalMsg)
    
    // Modify one field after signing
    const tamperedClaim = { ...normalClaim, recordRootHash: '0xdef' }
    const tamperedProof = { claim: tamperedClaim, signature: normalSig }
    
    const verificationTampered = verifyProof(tamperedProof)
    expect(verificationTampered.valid).toBe(false)
    expect(verificationTampered.issuerMatches).toBe(false)
  })

  // 5. ECIES Large Payload Handling
  it('successfully processes ECIES encryption/decryption on a large payload (1MB)', async () => {
    const wallet = ethers.Wallet.createRandom()
    
    // Create 1MB of dummy data
    const largePayload = new Uint8Array(1024 * 1024)
    for (let i = 0; i < largePayload.length; i++) {
      largePayload[i] = i % 256
    }

    const start = performance.now()
    const envelope = await eciesEncrypt(wallet.publicKey, largePayload)
    const endEncrypt = performance.now()

    const decrypted = await eciesDecrypt(wallet.privateKey, envelope)
    const endDecrypt = performance.now()

    console.log(`[Benchmark] ECIES 1MB Encrypt: ${(endEncrypt - start).toFixed(2)}ms | Decrypt: ${(endDecrypt - endEncrypt).toFixed(2)}ms`)

    expect(decrypted).toEqual(largePayload)
  })
})
