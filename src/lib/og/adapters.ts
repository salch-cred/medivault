import type { RecordMeta } from './types'

/**
 * Storage abstraction over 0G decentralized storage. The ONLY implementation
 * is OgStorageAdapter (real 0G SDK). No mock implementation exists.
 */
export interface StorageAdapter {
  /** AES-256 encrypt client-side, then upload ciphertext to 0G. */
  uploadEncrypted(
    data: Uint8Array | File,
    key: Uint8Array,
    meta?: Record<string, unknown>,
  ): Promise<{ rootHash: string; txHash?: string }>

  /** Download ciphertext from 0G and AES-256 decrypt client-side. */
  downloadDecrypted(rootHash: string, key: Uint8Array): Promise<Uint8Array>

  /** Encrypt to a recipient wallet public key (ECIES) and upload. */
  shareToRecipient(
    data: Uint8Array,
    recipientPubKey: string,
  ): Promise<{ rootHash: string }>

  /** Verify the stored ciphertext still matches its Merkle root. */
  verifyIntegrity(rootHash: string): Promise<boolean>
}

/**
 * Decentralized record index over 0G-KV. The ONLY implementation is
 * KvIndexAdapter (real 0G-KV). No mock implementation exists.
 */
export interface IndexAdapter {
  put(record: RecordMeta): Promise<void>
  list(owner: string): Promise<RecordMeta[]>
  get(id: string): Promise<RecordMeta | null>
}
