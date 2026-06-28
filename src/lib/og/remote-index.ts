'use client'

// Durable, cross-device record index.
//
// The per-user list of RecordMeta is JSON-encoded, AES-256 encrypted (by the 0G
// SDK, using the wallet-derived vault key) and uploaded to 0G storage. A tiny
// pointer ({ rootHash }) is persisted via /api/og/index so any device that can
// re-derive the vault key (i.e. the same wallet) can rebuild the entire vault
// after logout/login, a cleared cache, or on a brand-new device.

import type { OgStorageAdapter } from './storage-adapter'
import type { RecordMeta } from './types'

export function mergeRecords(...lists: Array<RecordMeta[] | undefined | null>): RecordMeta[] {
  const score = (x: RecordMeta) => (x.rootHash ? 2 : 0) + (x.summaryRootHash ? 1 : 0)
  const map = new Map<string, RecordMeta>()
  for (const list of lists) {
    if (!list) continue
    for (const r of list) {
      if (!r || !r.id) continue
      const existing = map.get(r.id)
      if (!existing) {
        map.set(r.id, r)
        continue
      }
      if (score(r) > score(existing)) {
        map.set(r.id, r)
      } else if (
        score(r) === score(existing) &&
        (r.createdAt || '') > (existing.createdAt || '')
      ) {
        map.set(r.id, r)
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

function authHeaders(authHeader?: string | null): HeadersInit | undefined {
  return authHeader ? { 'x-medivault-auth': authHeader } : undefined
}

/** Fetch + decrypt the durable record index from 0G (via the KV pointer). */
export async function loadRemoteIndex(
  address: string,
  key: Uint8Array,
  storage: OgStorageAdapter | null,
  authHeader?: string | null,
): Promise<RecordMeta[]> {
  if (!storage || !address) return []
  try {
    const res = await fetch(`/api/og/index?address=${encodeURIComponent(address)}`, {
      headers: authHeaders(authHeader),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { rootHash?: string }
    if (!data || !data.rootHash) return []
    const bytes = await storage.downloadDecrypted(data.rootHash, key)
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return Array.isArray(parsed) ? (parsed as RecordMeta[]) : []
  } catch (e) {
    console.warn('Failed to load durable remote index (falling back to local):', e)
    return []
  }
}

// Avoid redundant re-uploads (and their gas cost) when the set of records has
// not changed within this session.
let lastSavedSignature = ''

/** Encrypt + upload the record index to 0G and persist its pointer. */
export async function saveRemoteIndex(
  address: string,
  key: Uint8Array,
  storage: OgStorageAdapter | null,
  records: RecordMeta[],
  authHeader?: string | null,
): Promise<void> {
  if (!storage || !address || records.length === 0) return
  try {
    const signature = records.map((r) => r.id).sort().join(',')
    if (signature === lastSavedSignature) return
    const bytes = new TextEncoder().encode(JSON.stringify(records))
    const { rootHash } = await storage.uploadEncrypted(bytes, key)
    const res = await fetch('/api/og/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'x-medivault-auth': authHeader } : {}),
      },
      body: JSON.stringify({ address, rootHash, updatedAt: new Date().toISOString() }),
    })
    if (res.ok) lastSavedSignature = signature
  } catch (e) {
    console.warn('Failed to save durable remote index (kept locally):', e)
  }
}
