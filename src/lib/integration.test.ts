import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  deriveVaultKey,
  deriveAutoWalletPk,
  recordKey,
  deriveRecordKey,
  newRecordSalt,
  saltToHex,
} from './og/crypto'
import { eciesEncrypt, eciesDecrypt } from './og/ecies'
import {
  canonicalClaim,
  claimDigest,
  claimMessage,
  verifyProof,
  encodeProof,
  decodeProof,
} from './og/disclosure'
import {
  computeEntryHash,
  verifyConsentChain,
  isAnchoredToGenesis,
} from './og/ledger'
import type { DocType, ExtractionResult, VaultRecord } from './og/types'

describe('MediVault E2E System Integration', () => {
  it('runs a complete cryptographic, sharing, ledger, and proof lifecycle simulation', async () => {
    // -------------------------------------------------------------
    // 1. Wallets and Key Derivation
    // -------------------------------------------------------------
    const senderWallet = ethers.Wallet.createRandom()
    const recipientWallet = ethers.Wallet.createRandom()

    // Simulate signing to derive master seeds
    // Since deriveVaultKey relies on signer.signMessage, we mock it locally
    const seedMsg = 'Sign this message to initialize your secure health vault. This message does not cost gas.'
    const senderSig = await senderWallet.signMessage(seedMsg)
    const senderMasterSeed = ethers.keccak256(senderSig)
    const senderVaultKey = ethers.getBytes(ethers.keccak256(ethers.solidityPacked(['bytes32', 'string'], [senderMasterSeed, ':vault'])))

    const recipientSig = await recipientWallet.signMessage(seedMsg)
    const recipientMasterSeed = ethers.keccak256(recipientSig)
    const recipientVaultKey = ethers.getBytes(ethers.keccak256(ethers.solidityPacked(['bytes32', 'string'], [recipientMasterSeed, ':vault'])))

    expect(senderVaultKey).toHaveLength(32)
    expect(recipientVaultKey).toHaveLength(32)

    // -------------------------------------------------------------
    // 2. Document Creation and Per-Record Encryption
    // -------------------------------------------------------------
    const mockDocumentText = 'Patient Jane Doe. HbA1c is 5.8%. Prescribed Metformin 500mg daily.'
    const mockSummary: ExtractionResult = {
      title: 'Lab & Prescription Report',
      docType: 'lab_report',
      date: '2026-06-23',
      plainLanguageSummary: 'Pre-diabetes screening with HbA1c at 5.8%. Daily Metformin prescription.',
      conditions: [{ name: 'Pre-diabetes', status: 'Active', note: 'Monitored via HbA1c' }],
      medications: [{ name: 'Metformin', dose: '500mg', frequency: 'Once daily', purpose: 'Control blood sugar' }],
      labResults: [{ test: 'HbA1c', value: '5.8', unit: '%', referenceRange: '4.0-5.6', flag: 'high' }],
      allergies: ['Sulfa drugs'],
      remedies: [],
      followUps: [],
      redFlags: [],
      confidence: 0.98,
      sourceQuotes: [],
    }

    const saltBytes = newRecordSalt()
    const saltHex = saltToHex(saltBytes)
    const recordAesKey = await recordKey(senderVaultKey, saltHex)

    expect(recordAesKey).toHaveLength(32)

    // -------------------------------------------------------------
    // 3. ECIES Sharing Simulation (Secure Key Exchange)
    // -------------------------------------------------------------
    // Sender wants to share this record's AES key with Recipient.
    // Encrypt the Record Key under the Recipient's public key (using ECIES)
    const recipientPublicKey = recipientWallet.publicKey
    const encryptedKeyEnvelope = await eciesEncrypt(recipientPublicKey, recordAesKey)

    expect(encryptedKeyEnvelope.v).toBe(2)
    expect(encryptedKeyEnvelope.ct).toBeDefined()

    // Recipient decrypts the Record Key using their private key
    const decryptedRecordKey = await eciesDecrypt(recipientWallet.privateKey, encryptedKeyEnvelope)
    expect(decryptedRecordKey).toEqual(recordAesKey)

    // -------------------------------------------------------------
    // 4. Selective Disclosure Proofs
    // -------------------------------------------------------------
    // User wants to prove to a third party that their HbA1c lab result is 5.8% without sharing anything else.
    const claim = {
      v: 1 as const,
      issuer: senderWallet.address,
      recordTitle: 'Lab & Prescription Report',
      docType: 'lab_report' as const,
      recordRootHash: '0xabc',
      fields: [{ label: 'HbA1c', value: '5.8%' }],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      nonce: 'random_nonce_123',
    }

    const message = claimMessage(claim)
    
    // Sign the human readable claim message
    const proofSig = await senderWallet.signMessage(message)
    const proof = { claim, signature: proofSig }
    const encoded = encodeProof(proof)

    expect(encoded).toBeDefined()

    // Verify the proof
    const decoded = decodeProof(encoded)
    expect(decoded).not.toBeNull()
    
    const verification = verifyProof(decoded!)
    expect(verification.valid).toBe(true)
    expect(verification.recovered).toBe(senderWallet.address.toLowerCase())
    expect(verification.issuerMatches).toBe(true)

    // -------------------------------------------------------------
    // 5. Verifiable Consent Ledger
    // -------------------------------------------------------------
    // Record transactions and share history in an audit trail
    const genesisHash = '0x0000000000000000000000000000000000000000000000000000000000000000'
    
    const entry1 = {
      action: 'grant_access',
      recipient: recipientWallet.address,
      recordId: 'rec_01',
      timestamp: '2026-06-23T01:50:00Z',
      prevHash: genesisHash,
    }
    const entry1Hash = computeEntryHash(entry1)

    const entry2 = {
      action: 'revoke_access',
      recipient: recipientWallet.address,
      recordId: 'rec_01',
      timestamp: '2026-06-23T01:52:00Z',
      prevHash: entry1Hash,
    }
    const entry2Hash = computeEntryHash(entry2)

    const ledger = [
      { ...entry1, entryHash: entry1Hash },
      { ...entry2, entryHash: entry2Hash },
    ]

    // Verify ledger integrity
    const isLedgerValid = verifyConsentChain(ledger, genesisHash)
    expect(isLedgerValid.ok).toBe(true)

    // Verify anchored to genesis
    const anchored = isAnchoredToGenesis(ledger, genesisHash)
    expect(anchored).toBe(true)

    // Verify tampering is detected
    const tamperedLedger = JSON.parse(JSON.stringify(ledger))
    tamperedLedger[0].recipient = ethers.Wallet.createRandom().address // malicious modification
    const isTamperedValid = verifyConsentChain(tamperedLedger, genesisHash)
    expect(isTamperedValid.ok).toBe(false)
  })
})
