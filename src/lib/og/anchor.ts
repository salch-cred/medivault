import { ethers } from 'ethers'

// On-chain anchoring of the encrypted vault index.
//
// MediVault keeps a durable, encrypted index of a user's records on 0G storage
// (a single root hash; see remote-index.ts). Anchoring writes that root hash
// into the calldata of a 0-value transaction on 0G Chain, sent from the user's
// auto-wallet to itself. The transaction is permanent and publicly visible on
// chainscan, giving a tamper-proof, timestamped commitment to the exact state
// of the vault index at that block -- without revealing any record contents
// (the index itself is encrypted, and only its root hash is anchored).

export const ANCHOR_PREFIX = 'MV-IDX1:'
export const ANCHOR_CHAIN_ID = 16661
const ANCHOR_RE = /^MV-IDX1:(0x[0-9a-fA-F]{64})$/

export type AnchorRecord = {
  txHash: string
  indexRoot: string
  anchoredAt: string
  chainId: number
}

/** Build the calldata hex committing to an index root hash. */
export function buildAnchorData(indexRoot: string): string {
  return ethers.hexlify(ethers.toUtf8Bytes(ANCHOR_PREFIX + indexRoot.toLowerCase()))
}

/** Recover the anchored index root from transaction calldata, or null. */
export function parseAnchorData(data: string): string | null {
  try {
    if (!data || data === '0x') return null
    const text = ethers.toUtf8String(data)
    const match = ANCHOR_RE.exec(text)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}
