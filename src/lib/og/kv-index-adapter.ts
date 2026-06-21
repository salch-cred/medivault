'use client'

// Real 0G-KV index adapter. Record metadata lives entirely on 0G-KV so the
// vault can rebuild from 0G with NO central database. We keep a reserved
// "record ids" list key per owner so list() can enumerate, plus one key per
// record id holding its RecordMeta JSON.

import { ethers } from 'ethers'
import {
  Batcher,
  KvClient,
  Indexer,
  getFlowContract,
} from '@0gfoundation/0g-storage-ts-sdk'
import { ZG } from './config'
import { applyNodeProxy } from './proxy'
import type { IndexAdapter } from './adapters'
import type { RecordMeta } from './types'
import { deriveStreamId, kvKeyBytes, KV_INDEX_LIST_KEY } from './crypto'

type Tuple<T> = [T, unknown]

// Standard + URL-safe base64 charset. The KV node occasionally returns an
// error string or HTML instead of data; reject those rather than letting
// ethers.decodeBase64 throw an opaque error (and avoid logging PHI-adjacent
// node responses to the console).
const BASE64_RE = /^[A-Za-z0-9+/_-]*={0,2}$/

function decodeBase64Safe(value: string): Uint8Array | null {
  const v = value.trim()
  if (!v || !BASE64_RE.test(v) || v.length % 4 !== 0) return null
  try {
    return ethers.decodeBase64(v)
  } catch {
    return null
  }
}

export class KvIndexAdapter implements IndexAdapter {
  private readonly signer: ethers.Signer
  private readonly indexer: Indexer
  private readonly kv: KvClient
  private readonly owner: string
  private readonly streamId: string

  constructor(signer: ethers.Signer, owner: string) {
    this.signer = signer
    this.owner = owner
    this.streamId = deriveStreamId(owner)
    this.indexer = new Indexer(ZG.INDEXER_RPC)
    applyNodeProxy(this.indexer) // shared proxy — no longer duplicated inline
    this.kv = new KvClient(ZG.KV_NODE_URL)
  }

  private saveToLocalStorage(record: RecordMeta) {
    if (typeof window === 'undefined') return
    try {
      const key = `medivault_local_records_${this.owner.toLowerCase()}`
      const existing = localStorage.getItem(key)
      const list: RecordMeta[] = existing ? JSON.parse(existing) : []
      const index = list.findIndex(r => r.id === record.id)
      if (index > -1) {
        list[index] = record
      } else {
        list.push(record)
      }
      localStorage.setItem(key, JSON.stringify(list))
    } catch (e) {
      console.warn('Failed to save to localStorage fallback:', e)
    }
  }

  private async write(entries: { key: string; value: Uint8Array }[]): Promise<void> {
    const [nodes, nodeErr] = (await (this.indexer as unknown as {
      selectNodes: (n: number) => Promise<Tuple<unknown>>
    }).selectNodes(1)) as Tuple<unknown>
    if (nodeErr) throw new Error(String(nodeErr))

    const flowContract = getFlowContract(ZG.FLOW_CONTRACT, this.signer)
    const batcher = new Batcher(
      1,
      nodes as never,
      flowContract as never,
      ZG.RPC_URL,
    )
    for (const { key, value } of entries) {
      ;(batcher as unknown as {
        streamDataBuilder: {
          set: (streamId: string, key: Uint8Array, value: Uint8Array) => void
        }
      }).streamDataBuilder.set(this.streamId, kvKeyBytes(key), value)
    }
    try {
      const [, execErr] = (await (batcher as unknown as {
        exec: () => Promise<Tuple<unknown>>
      }).exec()) as Tuple<unknown>
      if (execErr) {
        let msg = String(execErr)
        if (typeof execErr === 'object' && execErr !== null) {
          msg = (execErr as Error).message || JSON.stringify(execErr)
        }
        throw new Error('Batcher execErr: ' + msg)
      }
    } catch (err) {
      throw new Error('Batcher throw: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  private async readRaw(key: string): Promise<Uint8Array | null> {
    try {
      const value = await (this.kv as unknown as {
        getValue: (streamId: string, key: Uint8Array) => Promise<unknown>
      }).getValue(this.streamId, kvKeyBytes(key))
      if (value === null || value === undefined) return null
      // The KV node may return a base64 string, a { data } wrapper, or bytes.
      if (typeof value === 'string') return decodeBase64Safe(value)
      const data = (value as { data?: string }).data
      if (typeof data === 'string') return decodeBase64Safe(data)
      if (value instanceof Uint8Array) return value
      return null
    } catch (e) {
      console.warn('0G KV read failed (node might be down), gracefully returning null:', e)
      return null
    }
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const bytes = await this.readRaw(key)
    if (!bytes) return null
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T
    } catch {
      return null
    }
  }

  private async readIdList(): Promise<string[]> {
    const ids = await this.readJson<string[]>(KV_INDEX_LIST_KEY)
    return Array.isArray(ids) ? ids : []
  }

  async put(record: RecordMeta): Promise<void> {
    // Save to local storage first as a guaranteed client-side fallback
    this.saveToLocalStorage(record)

    try {
      const ids = await this.readIdList()
      const nextIds = ids.includes(record.id) ? ids : [...ids, record.id]

      const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))
      await this.write([
        { key: record.id, value: enc(record) },
        { key: KV_INDEX_LIST_KEY, value: enc(nextIds) },
      ])
    } catch (e) {
      console.warn('Failed to write metadata to 0G KV (stored locally instead):', e)
    }
  }

  async registerPublicKey(publicKey: string): Promise<void> {
    try {
      const enc = (v: string) => new TextEncoder().encode(v)
      await this.write([
        { key: '__medivault_pubkey__', value: enc(publicKey) }
      ])
    } catch (e) {
      console.warn('Failed to write public key to 0G KV:', e)
    }
  }

  async get(id: string): Promise<RecordMeta | null> {
    const record = await this.readJson<RecordMeta>(id)
    if (record) return record

    // Fall back to localStorage only if KV is unavailable.
    if (typeof window !== 'undefined') {
      try {
        const key = `medivault_local_records_${this.owner.toLowerCase()}`
        const existing = localStorage.getItem(key)
        if (existing) {
          const list: RecordMeta[] = JSON.parse(existing)
          return list.find((r) => r.id === id) || null
        }
      } catch (e) {
        console.warn('Failed to read from localStorage fallback:', e)
      }
    }
    return null
  }

  async list(owner: string): Promise<RecordMeta[]> {
    const ownerLower = owner.toLowerCase()

    // Try 0G-KV first.
    try {
      const ids = await this.readIdList()
      if (ids.length > 0) {
        const records = await Promise.all(ids.map((id) => this.readJson<RecordMeta>(id)))
        const filtered = records.filter(
          (r): r is RecordMeta => !!r && r.owner.toLowerCase() === ownerLower,
        )
        if (filtered.length > 0) {
          return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        }
      }
    } catch (e) {
      console.warn('Failed to list records from 0G KV index:', e)
    }

    // Fall back to localStorage ONLY if KV returned nothing.
    // Apply the same owner filter to localStorage results for consistency.
    if (typeof window !== 'undefined') {
      try {
        const key = `medivault_local_records_${ownerLower}`
        const existing = localStorage.getItem(key)
        if (existing) {
          const list: RecordMeta[] = JSON.parse(existing)
          return list
            .filter((r) => r.owner.toLowerCase() === ownerLower)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        }
      } catch (e) {
        console.warn('Failed to read fallback list from localStorage:', e)
      }
    }

    return []
  }
}
