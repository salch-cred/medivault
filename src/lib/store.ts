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
import { ZG } from '@/lib/og/config'
import { EMPTY_EXTRACTION } from '@/lib/og/types'
import type { ExtractionResult, RecordMeta, VaultRecord } from '@/lib/og/types'

type Status = 'disconnected' | 'connecting' | 'connected'

type BackupStatus = 'pending' | 'stored' | 'failed'

const SUMMARY_DECRYPT_TIMEOUT_MS = 25_000

// Records currently in an automatic backup-retry loop. Module-level so a single
// loop runs per record id even across component re-mounts / re-renders.
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
  // In-memory cache of decrypted ORIGINAL document bytes, keyed by record id.
  // Populated at upload time so opening a freshly uploaded record renders the
  // original INSTANTLY with zero network round-trips (no waiting on the 0G
  // indexer to propagate the file). Not persisted to disk to avoid
  // localStorage quota issues with large files; on a full reload we fall back
  // to a 0G download (which uses the propagation-aware read-retry).
  originals: Record<string, Uint8Array>
  // Background 0G-backup status per record id. Uploads complete optimistically
  // (record shown instantly from local cache) while the real on-chain storage
  // finalizes in the background. 'pending' while uploading/retrying, 'stored'
  // on success, 'failed' only when we genuinely can't retry (original bytes no
  // longer in memory).
  uploadStatus: Record<string, BackupStatus>
  // Ids whose summary failed to load this session (e.g. ciphertext never
  // successfully stored on 0G during the earlier broken era). We short-circuit
  // these so the vault page doesn't re-download+retry them on every render and
  // flood the console with network errors. Cleared on connect/disconnect.
  failedSummaries: Record<string, boolean>
  receivedRecords: any[]
  loadingRecords: boolean
  language: string
  eli5: boolean
  emergency: {
    bloodType: string
  }
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
    payload: {
      title: string
      docType: string
      date: string | null
      fileName?: string | null
      mimeType?: string | null
    }
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

      try {
        const autoWalletPubKey = ethers.SigningKey.computePublicKey(autoWalletPk, true)
        await fetch('/api/og/pubkey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, publicKey: autoWalletPubKey }),
        })
        await index.registerPublicKey(autoWalletPubKey)
      } catch (pubkeyErr) {
        console.warn('Failed to register public key:', pubkeyErr)
      }

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
    } catch (err) {
      set({
        status: 'disconnected',
        error: err instanceof Error ? err.message : 'Failed to connect wallet.',
      })
    }
  },

  disconnect: () => {
    // NOTE: we intentionally KEEP the encrypted record/summary cache on disk so
    // logging back in with the same wallet restores the vault instantly. That
    // cache is AES-GCM encrypted with the wallet-derived key, so only this
    // wallet can ever decrypt it. (Previously we wiped it here, which is exactly
    // what made records 'disappear' after logout/login.) We still clear the
    // in-memory master seed + burner key so the signing secret never lingers.
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
    const { index, address, key, storage, records: current } = get()
    if (!index || !address) return
    set({ loadingRecords: true })
    try {
      const networkRecords = await index.list(address)

      // Pull the durable, cross-device index stored on 0G. This is what lets a
      // logged-out / cache-cleared / brand-new-device session rebuild the vault.
      let remoteRecords: RecordMeta[] = []
      if (key && storage) {
        try {
          remoteRecords = await loadRemoteIndex(address, key, storage)
        } catch {}
      }

      // MERGE (never overwrite) so no locally-known record is ever dropped.
      const merged = mergeRecords(current, networkRecords, remoteRecords)
      set({ records: merged, error: null })
      if (key) await saveCachedRecords(address, key, merged)

      // Self-heal: if local knows about records the durable 0G index doesn't yet
      // have, push the merged set up so the next device/login sees everything.
      if (key && storage && merged.length > remoteRecords.length) {
        void saveRemoteIndex(address, key, storage, merged)
      }

      const sharedRes = await fetch(`/api/og/share?address=${encodeURIComponent(address)}`)
      if (sharedRes.ok) {
        const sharedData = await sharedRes.json()
        set({ receivedRecords: sharedData })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load records.' })
    } finally {
      set({ loadingRecords: false })
    }
  },

  loadSummary: async (meta) => {
    const { storage, key, summaries, failedSummaries, address } = get()
    if (summaries[meta.id]) return summaries[meta.id]
    // Already failed this session -> don't re-download / re-decrypt. This stops
    // the vault page from hammering the network for records whose ciphertext
    // isn't retrievable (and avoids the AxiosError ERR_NETWORK console flood).
    if (failedSummaries[meta.id]) return null
    if (!storage || !key || !meta.summaryRootHash) return null

    try {
      const recKey = await recordKey(key, meta.recordKeySalt)
      const bytes = await withTimeout(
        storage.downloadDecrypted(meta.summaryRootHash, recKey),
        SUMMARY_DECRYPT_TIMEOUT_MS,
        'Summary decryption',
      )
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

    // Persist to the local index fallback IMMEDIATELY (localStorage write, no
    // gas / no network) so the record is never lost even if the slow background
    // 0G upload fails. The durable cross-device 0G index is synced separately
    // (after the file upload finalizes) to avoid auto-wallet nonce contention.
    void index?.put(meta).catch((e) => console.warn('Local index put failed:', e))
  },

  cacheOriginal: (id, bytes) => {
    set({ originals: { ...get().originals, [id]: bytes } })
  },

  getCachedOriginal: (id) => {
    return get().originals[id] ?? null
  },

  setUploadStatus: (id, status) => {
    set({ uploadStatus: { ...get().uploadStatus, [id]: status } })
  },

  // Single attempt to store a record's original + summary on 0G from the
  // locally-cached original bytes. Returns true on success. Used by autoBackup
  // (the retry loop) and the upload flow.
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
      const uploads: Promise<unknown>[] = [storage.uploadEncrypted(original, recKey)]
      const summary = summaries[meta.id]
      if (summary) {
        const summaryBytes = new TextEncoder().encode(JSON.stringify(summary))
        uploads.push(storage.uploadEncrypted(summaryBytes, recKey))
      }
      await Promise.all(uploads)
      if (index) await index.put(meta).catch((e) => console.warn('KV index write failed:', e))
      get().setUploadStatus(meta.id, 'stored')
      // Record bytes are now on 0G -> publish the durable cross-device index.
      get().syncRemoteIndex()
      return true
    } catch (e) {
      console.error('Background 0G backup failed:', e)
      get().setUploadStatus(meta.id, 'failed')
      return false
    }
  },

  // Automatically retry the 0G backup with capped exponential backoff until it
  // succeeds. The user never has to click 'retry' -- once the network (or gas)
  // recovers, the next attempt lands and the record is permanently on 0G.
  autoBackup: async (meta) => {
    if (autoBackupInFlight.has(meta.id)) return
    autoBackupInFlight.add(meta.id)
    try {
      let delay = 1500
      const MAX_DELAY = 20_000
      for (;;) {
        // Re-uploading needs the original bytes (kept in memory). If they're
        // gone (e.g. a full page reload before the backup finished) we can't
        // retry from here -> surface 'failed' and stop the loop.
        if (!get().getCachedOriginal(meta.id)) {
          get().setUploadStatus(meta.id, 'failed')
          return
        }
        const ok = await get().backupRecord(meta)
        if (ok) return
        // Still failing -> keep the optimistic 'pending' look (we ARE retrying)
        // rather than scaring the user with a 'failed' badge.
        get().setUploadStatus(meta.id, 'pending')
        // If the auto-wallet is simply out of gas, retrying fast is pointless --
        // back off to the max interval so a later top-up is picked up
        // automatically (the very next attempt will then succeed).
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

  // Save a record that was SHARED WITH the current wallet into this wallet's own
  // vault, permanently. The recipient becomes a true owner: the original file +
  // summary are re-encrypted under THIS wallet's own per-record key and stored
  // on 0G under this wallet's index, so the shared document stays in the vault
  // forever (survives logout/login and is restorable on any device) and opens
  // instantly from cache on subsequent visits. Idempotent per share hash.
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

      // Compute both Merkle roots LOCALLY (no network / no gas) so the record
      // appears in the vault immediately; the actual on-chain 0G storage is
      // finalized in the background and auto-retried until it lands.
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

      // Persist + show instantly (local encrypted cache => stays in wallet even
      // before the 0G backup finishes, and survives logout/login).
      get().addRecord(meta, effectiveSummary)
      get().cacheOriginal(meta.id, originalBytes)
      get().setUploadStatus(meta.id, 'pending')

      void (async () => {
        try {
          // Finalize sequentially (NOT in parallel) so the single auto-wallet
          // never broadcasts two Flow `submit` transactions on the same nonce at
          // once -- that race caused nonce/gas contention and require(false)
          // reverts. Each finalize already self-heals duplicates via the storage
          // adapter's on-chain existence check.
          await filePrep.finalize()
          await summaryPrep.finalize()
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

  // Encrypt + upload the current record index to 0G and persist its pointer so
  // the vault survives logout/login and is recoverable on any device.
  syncRemoteIndex: () => {
    const { address, key, storage, records } = get()
    if (address && key && storage) {
      void saveRemoteIndex(address, key, storage, records)
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
