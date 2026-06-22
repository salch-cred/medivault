'use client'

import { encryptString, decryptString } from './cache-crypto'
import type { ExtractionResult, RecordMeta } from './types'

/**
 * Encrypted localStorage cache for decrypted vault records and summaries.
 *
 * Previously these were stored in plaintext, which leaked full PHI to anyone
 * with localStorage access (XSS, shared devices, forensics). They are now
 * AES-GCM encrypted with the wallet-derived vault key before being written.
 *
 * If decryption fails (wrong wallet / corrupted data) the cache is treated as
 * empty and rebuilt from 0G, which is the safe failure mode.
 */

const RECORDS_PREFIX = 'medivault_records_'
const SUMS_PREFIX = 'medivault_sums_'

function recordsKey(address: string) {
  return `${RECORDS_PREFIX}${address.toLowerCase()}`
}
function sumsKey(address: string) {
  return `${SUMS_PREFIX}${address.toLowerCase()}`
}

export async function loadCachedRecords(
  address: string,
  key: Uint8Array,
): Promise<RecordMeta[]> {
  const raw = localStorage.getItem(recordsKey(address))
  if (!raw) return []
  try {
    const json = await decryptString(raw, key)
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as RecordMeta[]) : []
  } catch {
    // Wrong key (different wallet) or tampered cache — discard and rebuild.
    localStorage.removeItem(recordsKey(address))
    return []
  }
}

export async function loadCachedSummaries(
  address: string,
  key: Uint8Array,
): Promise<Record<string, ExtractionResult>> {
  const raw = localStorage.getItem(sumsKey(address))
  if (!raw) return {}
  try {
    const json = await decryptString(raw, key)
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ExtractionResult>) : {}
  } catch {
    localStorage.removeItem(sumsKey(address))
    return {}
  }
}

export async function saveCachedRecords(
  address: string,
  key: Uint8Array,
  records: RecordMeta[],
): Promise<void> {
  try {
    const enc = await encryptString(JSON.stringify(records), key)
    localStorage.setItem(recordsKey(address), enc)
  } catch {
    // Quota / serialization errors must not break the upload flow.
  }
}

export async function saveCachedSummaries(
  address: string,
  key: Uint8Array,
  summaries: Record<string, ExtractionResult>,
): Promise<void> {
  try {
    const enc = await encryptString(JSON.stringify(summaries), key)
    localStorage.setItem(sumsKey(address), enc)
  } catch {
    // ignore
  }
}

/** Remove ALL medivault cache entries for an address (used on disconnect). */
export function clearAddressCache(address: string): void {
  const a = address.toLowerCase()
  localStorage.removeItem(`${RECORDS_PREFIX}${a}`)
  localStorage.removeItem(`${SUMS_PREFIX}${a}`)
}

/** Remove the unencrypted burner key if present (legacy/fallback path). */
export function clearBurnerKey(): void {
  localStorage.removeItem('medivault_burner_key')
}
