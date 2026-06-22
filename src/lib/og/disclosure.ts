import { ethers } from 'ethers'
import type { DocType } from './types'

// Signed selective-disclosure health proofs.
//
// The owner reveals only the fields they choose from a single record and signs
// a claim with their wallet. The claim commits to the record's 0G root hash, so
// any verifier can confirm (a) the proof was signed by the stated owner address
// and (b) which 0G-stored record it refers to -- without ever seeing the rest
// of the encrypted record. Verification is pure client-side ECDSA recovery; no
// server or network call is required.
//
// NOTE: this proves authorship + binding, not that the disclosed values match
// the ciphertext (that would require a ZK circuit over the encrypted blob).

export type DisclosedField = { label: string; value: string }

export type DisclosureClaim = {
  v: 1
  issuer: string
  recordTitle: string
  docType: DocType
  recordRootHash: string
  fields: DisclosedField[]
  issuedAt: string
  expiresAt: string | null
  nonce: string
}

export type DisclosureProof = { claim: DisclosureClaim; signature: string }

export function canonicalClaim(claim: DisclosureClaim): string {
  const ordered = {
    v: claim.v,
    issuer: claim.issuer.toLowerCase(),
    recordTitle: claim.recordTitle,
    docType: claim.docType,
    recordRootHash: claim.recordRootHash,
    fields: claim.fields.map((f) => ({ label: f.label, value: f.value })),
    issuedAt: claim.issuedAt,
    expiresAt: claim.expiresAt,
    nonce: claim.nonce,
  }
  return JSON.stringify(ordered)
}

export function claimDigest(claim: DisclosureClaim): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalClaim(claim)))
}

export function claimMessage(claim: DisclosureClaim): string {
  const lines = [
    'MediVault selective-disclosure health proof',
    'Issuer: ' + claim.issuer.toLowerCase(),
    'Record: ' + claim.recordTitle,
    '0G root: ' + claim.recordRootHash,
    'Issued: ' + claim.issuedAt,
    'Expires: ' + (claim.expiresAt ?? 'never'),
    'Discloses ' + claim.fields.length + ' field(s)',
    'Nonce: ' + claim.nonce,
    'Digest: ' + claimDigest(claim),
  ]
  return lines.join('\n')
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const b64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : Buffer.from(input, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  if (typeof atob !== 'undefined') {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  return Buffer.from(padded, 'base64').toString('utf8')
}

export function encodeProof(proof: DisclosureProof): string {
  return toBase64Url(JSON.stringify(proof))
}

export function decodeProof(token: string): DisclosureProof | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token.trim())) as DisclosureProof
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.claim || typeof parsed.signature !== 'string') return null
    if (!parsed.claim.issuer || !Array.isArray(parsed.claim.fields)) return null
    return parsed
  } catch {
    return null
  }
}

export type DisclosureVerification = {
  valid: boolean
  recovered: string | null
  issuerMatches: boolean
  expired: boolean
  reason?: string
}

export function verifyProof(proof: DisclosureProof): DisclosureVerification {
  try {
    const recovered = ethers
      .verifyMessage(claimMessage(proof.claim), proof.signature)
      .toLowerCase()
    const issuerMatches = recovered === proof.claim.issuer.toLowerCase()
    const expired = proof.claim.expiresAt
      ? Date.now() > Date.parse(proof.claim.expiresAt)
      : false
    let reason: string | undefined
    if (!issuerMatches) reason = 'The signature does not match the stated issuer address.'
    else if (expired) reason = 'This proof has expired and is no longer valid.'
    return { valid: issuerMatches && !expired, recovered, issuerMatches, expired, reason }
  } catch {
    return {
      valid: false,
      recovered: null,
      issuerMatches: false,
      expired: false,
      reason: 'The proof signature is malformed.',
    }
  }
}
