import { ethers } from 'ethers'

// Verifiable consent & access ledger.
//
// Every share is recorded as an append-only, hash-chained event keyed to the
// record owner. Each entry's hash commits to its own contents AND the previous
// entry's hash, so any insertion, edit, reorder, or deletion breaks the chain
// and is detectable by anyone who recomputes it. The same helpers run on the
// server (when writing) and in the browser (when re-verifying), so the user
// never has to trust the server's word.

export type ConsentEventType = 'grant' | 'revoke'

export type ConsentEvent = {
  id: string
  ts: string
  type: ConsentEventType
  actor: string
  recipient: string
  recordTitle: string
  recordRootHash: string
  prevHash: string
  entryHash: string
}

export type ConsentEventCore = Omit<ConsentEvent, 'entryHash'>

export const GENESIS_HASH = '0x' + '0'.repeat(64)

// Deterministic, field-ordered serialization so the hash is reproducible.
export function canonicalConsentPayload(e: ConsentEventCore): string {
  return JSON.stringify({
    id: e.id,
    ts: e.ts,
    type: e.type,
    actor: e.actor,
    recipient: e.recipient,
    recordTitle: e.recordTitle,
    recordRootHash: e.recordRootHash,
    prevHash: e.prevHash,
  })
}

export function computeEntryHash(e: ConsentEventCore): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalConsentPayload(e)))
}

export type ChainVerification = { ok: boolean; brokenAt: number | null }

// Re-derive every entry hash and confirm each links to the previous entry.
// Returns the zero-based index of the first broken entry, if any.
export function verifyConsentChain(entries: ConsentEvent[]): ChainVerification {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const recomputed = computeEntryHash({
      id: e.id,
      ts: e.ts,
      type: e.type,
      actor: e.actor,
      recipient: e.recipient,
      recordTitle: e.recordTitle,
      recordRootHash: e.recordRootHash,
      prevHash: e.prevHash,
    })
    if (recomputed !== e.entryHash) return { ok: false, brokenAt: i }
    if (i > 0 && e.prevHash !== entries[i - 1].entryHash) return { ok: false, brokenAt: i }
  }
  return { ok: true, brokenAt: null }
}

export function isAnchoredToGenesis(entries: ConsentEvent[]): boolean {
  return entries.length === 0 || entries[0].prevHash === GENESIS_HASH
}
