'use client'

import { create } from 'zustand'
import { ethers } from 'ethers'

import { deriveVaultKey, deriveAutoWalletPk, recordKey, clearMasterSeed } from '@/lib/og/crypto'
import { OgStorageAdapter } from '@/lib/og/storage-adapter'
import { KvIndexAdapter } from '@/lib/og/kv-index-adapter'
import {
  loadCachedRecords,
  loadCachedSummaries,
  saveCachedRecords,
  saveCachedSummaries,
  clearAddressCache,
  clearBurnerKey,
} from '@/lib/og/cache'
import { ZG } from '@/lib/og/config'
import type { ExtractionResult, RecordMeta, VaultRecord } from '@/lib/og/types'

type Status = 'disconnected' | 'connecting' | 'connected'

const SUMMARY_DECRYPT_TIMEOUT_MS = 25_000

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
    const { address } = get()
    if (address) clearAddressCache(address)
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
      receivedRecords: [],
    })
  },

  refresh: async () => {
    const { index, address, key } = get()
    if (!index || !address) return
    set({ loadingRecords: true })
    try {
      const networkRecords = await index.list(address)
      set({ records: networkRecords, error: null })
      if (key) await saveCachedRecords(address, key, networkRecords)

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
    const { storage, key, summaries, address } = get()
    if (summaries[meta.id]) return summaries[meta.id]
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
      return null
    }
  },

  addRecord: (meta, summary) => {
    const { address, records, summaries, key } = get()
    const newRecords = [meta, ...records.filter((r) => r.id !== meta.id)]
    const newSummaries = { ...summaries, [meta.id]: summary }
    set({ records: newRecords, summaries: newSummaries })

    if (address && key) {
      void saveCachedRecords(address, key, newRecords)
      void saveCachedSummaries(address, key, newSummaries)
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
