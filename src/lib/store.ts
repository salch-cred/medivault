'use client'

import { create } from 'zustand'
import { ethers } from 'ethers'

import { deriveVaultKey, deriveAutoWalletPk, recordKey, deriveRecordKey, newRecordSalt, saltToHex, clearMasterSeed } from '@/lib/og/crypto'
import { OgStorageAdapter } from '@/lib/og/storage-adapter'
import { KvIndexAdapter } from '@/lib/og/kv-index-adapter'
import {
  loadCachedRecords,
  loadCachedSummaries,
  saveCachedRecords,
  saveCachedSummaries,
  clearBurnerKey,
} from '@/lib/og/cache'
import { loadRemoteIndex, saveRemoteIndex, mergeRecords } from '@/lib/og/remote-index'
import { buildAuthHeader, getCachedAuthHeader } from '@/lib/client/auth'
import { ZG } from '@/lib/og/config'
import { EMPTY_EXTRACTION } from '@/lib/og/types'
import type { ExtractionResult, RecordMeta, VaultRecord, ReceivedRecord } from '@/lib/og/types'

type Status = 'disconnected' | 'connecting' | 'connected'

type BackupStatus = 'pending' | 'stored' | 'failed'

const SUMMARY_DECRYPT_TIMEOUT_MS = 25_000
const autoBackupInFlight = new Set<string>()

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

type VaultState = {
  status: Status
  address: string | null
  autoWalletAddress: string | null
  autoWalletSigner: ethers.Signer | null
  error: string | null
  key: Uint8Array | null
  signer: ethers.Signer | null
  storage: OgStorageAdapter | null
  index: KvIndexAdapter | null
  records: RecordMeta[]
  summaries: Record<string, ExtractionResult>
  originals: Record<string, Uint8Array>
  uploadStatus: Record<string, BackupStatus>
  failedSummaries: Record<string, boolean>
  receivedRecords: ReceivedRecord[]
  loadingRecords: boolean
  language: string
  eli5: boolean
  emergency: { bloodType: string }
  connect: (provider: ethers.BrowserProvider, address: string) => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
  loadSummary: (meta: RecordMeta) => Promise<ExtractionResult | null>
  addRecord: (meta: RecordMeta, summary: ExtractionResult) => void
  cacheOriginal: (id: string, bytes: Uint8Array) => void
  getCachedOriginal: (id: string) => Uint8Array | null
  setUploadStatus: (id: string, status: BackupStatus) => void
  backupRecord: (meta: RecordMeta) => Promise<boolean>
  autoBackup: (meta: RecordMeta) => Promise<void>
  importReceivedRecord: (args: {
    shareHash: string
    payload: { title: string; docType: string; date: string | null; fileName?: string | null; mimeType?: string | null }
    originalBytes: Uint8Array
    summary: ExtractionResult | null
  }) => Promise<string | null>
  syncRemoteIndex: () => void
  getRecordKey: (meta: RecordMeta) => Promise<Uint8Array | null>
  setLanguage: (lang: string) => void
  setEli5: (v: boolean) => void
  setBloodType: (v: string) => void
  getRecord: (id: string) => VaultRecord | null
}

export const useVault = create<VaultState>((set, get) => ({
  status: 'disconnected',
  address: null,
  autoWalletAddress: null,
  autoWalletSigner: null,
  error: null,
  key: null,
  signer: null,
  storage: null,
  index: null,
  records: [],
  summaries: {},
  originals: {},
  uploadStatus: {},
  failedSummaries: {},
  receivedRecords: [],
  loadingRecords: false,
  language: 'English',
  eli5: false,
  emergency: { bloodType: '' },

  connect: async (provider: ethers.BrowserProvider, address: string) => {
    set({ status: 'connecting', error: null })
    try {
      const signer = await provider.getSigner()
      const key = await deriveVaultKey(signer)
      const autoWalletPk = await deriveAutoWalletPk(signer)

      const rpcProvider = new ethers.JsonRpcProvider(ZG.RPC_URL, {
        chainId: ZG.CHAIN_ID,
        name: ZG.CHAIN_NAME,
      }, { staticNetwork: true })
      const storageSigner = new ethers.Wallet(autoWalletPk, rpcProvider)

      const storage = new OgStorageAdapter(storageSigner)
      const index = new KvIndexAdapter(storageSigner, address)

      let cachedRecords: RecordMeta[] = []
      let cachedSummaries: Record<string, ExtractionResult> = {}
      try {
        cachedRecords = await loadCachedRecords(address, key)
        cachedSummaries = await loadCachedSummaries(address, key)
      } catch {}

      set({
        status: 'connected',
        address,
        autoWalletAddress: storageSigner.address,
        autoWalletSigner: storageSigner,
        key,
        signer,
        storage,
        index,
        records: cachedRecords,
        summaries: cachedSummaries,
        originals: {},
        uploadStatus: {},
        failedSummaries: {},
        receivedRecords: [],
      })
      await get().refresh()

      // Publish our public key so other users can encrypt shared records to us.
      // Inbound shares are decrypted with the AUTO-WALLET private key, so we must
      // register the auto-wallet's PUBLIC key (not the main wallet's), keyed by
      // our main wallet address -- that is the value senders look up at
      // GET /api/og/pubkey before encrypting. Best-effort and fire-and-forget:
      // it only affects inbound sharing and reuses the auth header refresh()
      // already cached, so it never triggers an extra wallet signature.
      void (async () => {
        try {
          const publicKey = new ethers.SigningKey(autoWalletPk).publicKey
          const auth = await buildAuthHeader(signer, address)
          if (!auth) return
          await fetch('/api/og/pubkey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-medivault-auth': auth },
            body: JSON.stringify({ address, publicKey }),
          })
        } catch (e) {
          console.warn('Failed to register sharing public key:', e)
        }
      })()
    } catch (err) {
      set({ status: 'disconnected', error: err instanceof Error ? err.message : 'Failed to connect wallet.' })
    }
  },

  disconnect: () => {
    clearBurnerKey()
    clearMasterSeed()
    set({
      status: 'disconnected',
      address: null,
      autoWalletAddress: null,
      autoWalletSigner: null,
      key: null,
      signer: null,
      storage: null,
      index: null,
      records: [],
      summaries: {},
      originals: {},
      uploadStatus: {},
      failedSummaries: {},
      receivedRecords: [],
    })
  },

  refresh: async () => {
    const { index, address, key, storage, records: current, signer } = get()
    if (!index || !address) return
    set({ loadingRecords: true })
    try {
      const auth = await buildAuthHeader(signer, address)
      const networkRecords = await index.list(address)

      let remoteRecords: RecordMeta[] = []
      if (key && storage) {
        try { remoteRecords = await loadRemoteIndex(address, key, storage, auth) } catch {}
      }

      const merged = mergeRecords(current, networkRecords, remoteRecords)
      set({ records: merged, error: null })
      if (key) await saveCachedRecords(address, key, merged)

      if (key && storage && merged.length > remoteRecords.length && auth) {
        void saveRemoteIndex(address, key, storage, merged, auth)
      }

      const sharedRes = await fetch(`/api/og/share?address=${encodeURIComponent(address)}`, {
        headers: auth ? { 'x-medivault-auth': auth } : undefined,
      })
      if (sharedRes.ok) set({ receivedRecords: await sharedRes.json() })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load records.' })
    } finally {
      set({ loadingRecords: false })
    }
  },

  loadSummary: async (meta) => {
    const { storage, key, summaries, failedSummaries, address } = get()
    if (summaries[meta.id]) return summaries[meta.id]
    if (failedSummaries[meta.id]) return null
    if (!storage || !key || !meta.summaryRootHash) return null

    try {
      const recKey = await recordKey(key, meta.recordKeySalt)
      const bytes = await withTimeout(storage.downloadDecrypted(meta.summaryRootHash, recKey), SUMMARY_DECRYPT_TIMEOUT_MS, 'Summary decryption')
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ExtractionResult
      const newSummaries = { ...get().summaries, [meta.id]: parsed }
      set({ summaries: newSummaries })
      if (address) await saveCachedSummaries(address, key, newSummaries)
      return parsed
    } catch (err) {
      console.warn('Failed to load/decrypt summary:', err)
      set({ failedSummaries: { ...get().failedSummaries, [meta.id]: true } })
      return null
    }
  },

  addRecord: (meta, summary) => {
    const { address, records, summaries, key, index } = get()
    const newRecords = mergeRecords([meta], records)
    const newSummaries = { ...summaries, [meta.id]: summary }
    set({ records: newRecords, summaries: newSummaries })

    if (address && key) {
      void saveCachedRecords(address, key, newRecords)
      void saveCachedSummaries(address, key, newSummaries)
    }
    void index?.put(meta).catch((e) => console.warn('Local index put failed:', e))
  },

  cacheOriginal: (id, bytes) => set({ originals: { ...get().originals, [id]: bytes } }),
  getCachedOriginal: (id) => get().originals[id] ?? null,
  setUploadStatus: (id, status) => set({ uploadStatus: { ...get().uploadStatus, [id]: status } }),

  backupRecord: async (meta) => {
    const { storage, index, summaries } = get()
    if (!storage) return false
    const original = get().getCachedOriginal(meta.id)
    const recKey = await get().getRecordKey(meta)
    if (!original || !recKey) {
      get().setUploadStatus(meta.id, 'failed')
      return false
    }
    get().setUploadStatus(meta.id, 'pending')
    try {
      // Parallel upload: document + summary are independent (different root
      // hashes) — concurrent uploads halve the total 0G backup time.
      const summary = summaries[meta.id]
      await Promise.all([
        storage.uploadEncrypted(original, recKey),
        summary
          ? storage.uploadEncrypted(new TextEncoder().encode(JSON.stringify(summary)), recKey)
          : Promise.resolve(),
      ])
      if (index) await index.put(meta).catch((e) => console.warn('KV index write failed:', e))
      get().setUploadStatus(meta.id, 'stored')
      get().syncRemoteIndex()
      return true
    } catch (e) {
      console.error('Background 0G backup failed:', e)
      get().setUploadStatus(meta.id, 'failed')
      return false
    }
  },

  autoBackup: async (meta) => {
    if (autoBackupInFlight.has(meta.id)) return
    autoBackupInFlight.add(meta.id)
    try {
      let delay = 1500
      const MAX_DELAY = 20_000
      for (;;) {
        if (!get().getCachedOriginal(meta.id)) {
          get().setUploadStatus(meta.id, 'failed')
          return
        }
        const ok = await get().backupRecord(meta)
        if (ok) return
        get().setUploadStatus(meta.id, 'pending')
        try {
          const { autoWalletSigner, autoWalletAddress } = get()
          const provider = (autoWalletSigner as (ethers.Signer & { provider?: ethers.Provider | null }) | null)?.provider
          if (provider && autoWalletAddress) {
            const bal = await provider.getBalance(autoWalletAddress)
            if (bal === 0n) delay = MAX_DELAY
          }
        } catch {}
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(Math.round(delay * 1.6), MAX_DELAY)
      }
    } finally {
      autoBackupInFlight.delete(meta.id)
    }
  },

  importReceivedRecord: async ({ shareHash, payload, originalBytes, summary }) => {
    const { storage, key, index, address, records } = get()
    if (!storage || !key || !address) return null
    const importId = `shared_${shareHash.toLowerCase()}`
    const existing = records.find((r) => r.id === importId)
    if (existing) return existing.id

    const effectiveSummary = summary ?? EMPTY_EXTRACTION
    try {
      const salt = newRecordSalt()
      const recKey = await deriveRecordKey(key, salt)
      const summaryBytes = new TextEncoder().encode(JSON.stringify(effectiveSummary))
      const [filePrep, summaryPrep] = await Promise.all([
        storage.prepareUpload(originalBytes, recKey),
        storage.prepareUpload(summaryBytes, recKey),
      ])

      const meta: RecordMeta = {
        id: importId,
        owner: address,
        title: payload.title || effectiveSummary.title || 'Shared record',
        docType: (payload.docType as RecordMeta['docType']) || 'other',
        date: payload.date ?? null,
        rootHash: filePrep.rootHash,
        summaryRootHash: summaryPrep.rootHash,
        recordKeySalt: saltToHex(salt),
        fileName: payload.fileName ?? undefined,
        mimeType: payload.mimeType ?? undefined,
        createdAt: new Date().toISOString(),
      }

      get().addRecord(meta, effectiveSummary)
      get().cacheOriginal(meta.id, originalBytes)
      get().setUploadStatus(meta.id, 'pending')

      void (async () => {
        try {
          // Parallel finalize: document + summary are independent uploads.
          await Promise.all([filePrep.finalize(), summaryPrep.finalize()])
          if (index) await index.put(meta).catch((e) => console.warn('KV index write failed:', e))
          get().setUploadStatus(meta.id, 'stored')
          get().syncRemoteIndex()
        } catch (bgErr) {
          console.error('Saving shared record to your 0G failed; auto-retrying until it lands:', bgErr)
          get().setUploadStatus(meta.id, 'pending')
          void get().autoBackup(meta)
        }
      })()

      return meta.id
    } catch (e) {
      console.error('importReceivedRecord failed:', e)
      return null
    }
  },

  // Do not trigger wallet signature prompts from background upload completion.
  // If a fresh auth header already exists from a recent user action, use it;
  // otherwise skip remote-index sync. Local encrypted cache + local index remain
  // updated immediately, and remote sync can happen after the next explicit
  // wallet unlock/refresh.
  syncRemoteIndex: () => {
    const { address, key, storage, records } = get()
    if (address && key && storage) {
      const auth = getCachedAuthHeader(address)
      if (!auth) return
      void saveRemoteIndex(address, key, storage, records, auth).catch(() => {})
    }
  },

  getRecordKey: async (meta) => {
    const { key } = get()
    if (!key) return null
    return recordKey(key, meta.recordKeySalt)
  },

  setLanguage: (language) => set({ language }),
  setEli5: (eli5) => set({ eli5 }),
  setBloodType: (bloodType) => set({ emergency: { bloodType } }),

  getRecord: (id) => {
    const { records, summaries } = get()
    const meta = records.find((r) => r.id === id)
    if (!meta) return null
    return { meta, summary: summaries[id] }
  },
}))
