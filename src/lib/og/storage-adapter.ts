'use client'

// Real 0G Storage adapter. AES-256 encryption happens client-side inside the
// SDK BEFORE upload, so the 0G network only ever receives ciphertext. ECIES
// share-to-doctor encrypts to a recipient wallet public key.
//
// NOTE: The 0G SDK return signatures follow the documented [value, error]
// tuple convention. Types are loosely cast because the published typings can
// trail the runtime API across patch versions (>=1.2.6).

import { ethers } from 'ethers'
import {
  ZgFile,
  MemData,
  Blob as ZgBlob,
  Indexer,
} from '@0gfoundation/0g-storage-ts-sdk'
import { ZG } from './config'
import { applyNodeProxy } from './proxy'
import type { StorageAdapter } from './adapters'

type Tuple<T> = [T, unknown]

export class OgStorageAdapter implements StorageAdapter {
  private readonly indexer: Indexer
  private readonly signer: ethers.Signer

  constructor(signer: ethers.Signer, indexerRpc: string = ZG.INDEXER_RPC) {
    this.signer = signer
    this.indexer = new Indexer(indexerRpc)
    applyNodeProxy(this.indexer)
  }

  /** AES-256 encrypted upload of a File (browser) or in-memory bytes. */
  async uploadEncrypted(
    data: Uint8Array | File,
    key: Uint8Array,
  ): Promise<{ rootHash: string; txHash?: string }> {
    const blob: unknown =
      typeof File !== 'undefined' && data instanceof File
        ? new ZgBlob(data)
        : new MemData(data as Uint8Array)

    const [tree, treeErr] = (await (blob as {
      merkleTree: () => Promise<Tuple<{ rootHash: () => string }>>
    }).merkleTree()) as Tuple<{ rootHash: () => string }>
    if (treeErr) throw new Error(String(treeErr))
    const rootHash = (tree as { rootHash: () => string }).rootHash()

    // Smart retry: differentiate transient (network) vs permanent errors.
    // Transient errors get up to 5 retries with exponential backoff.
    // Permanent errors (malformed key, invalid file) fail immediately.
    let tx: unknown
    let upErr: unknown
    const maxRetries = 5
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const [attemptTx, attemptErr] = (await (this.indexer as unknown as {
        upload: (
          b: unknown,
          rpc: string,
          signer: ethers.Signer,
          opts: unknown,
        ) => Promise<Tuple<{ txHash?: string } | string>>
      }).upload(blob, ZG.RPC_URL, this.signer, {
        encryption: { type: 'aes256', key },
        finalityRequired: false,
      })) as Tuple<{ txHash?: string } | string>
      
      tx = attemptTx
      upErr = attemptErr
      if (!upErr) break
      
      const errStr = String(upErr)
      // Check if this is a transient error (network, timeout, connection reset)
      // vs a permanent error (invalid key, malformed data, insufficient funds).
      const isTransient =
        /network|timeout|connection|reset|ECONNREFUSED|ETIMEDOUT|fetch failed|socket hang up/i.test(errStr)
      
      if (!isTransient) {
        // Permanent error — don't waste time retrying.
        throw new Error(errStr)
      }
      
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1500 * Math.pow(2, attempt), 12000)
        console.warn(`0G upload failed (transient), retrying in ${backoffMs}ms... (${maxRetries - attempt - 1} attempts left)`, attemptErr)
        await new Promise(r => setTimeout(r, backoffMs))
      }
    }
    
    if (upErr) throw new Error(String(upErr))

    const txHash =
      typeof tx === 'string' ? tx : (tx as { txHash?: string })?.txHash
    return { rootHash, txHash }
  }

  /** Download ciphertext from 0G and AES-256 decrypt to bytes. */
  async downloadDecrypted(
    rootHash: string,
    key: Uint8Array,
  ): Promise<Uint8Array> {
    const [blob, err] = (await (this.indexer as unknown as {
      downloadToBlob: (
        root: string,
        opts: unknown,
      ) => Promise<Tuple<Blob>>
    }).downloadToBlob(rootHash, {
      proof: false,
      decryption: { symmetricKey: key },
    })) as Tuple<Blob>
    if (err) throw new Error(String(err))
    const buf = await (blob as Blob).arrayBuffer()
    return new Uint8Array(buf)
  }

  /** ECIES: encrypt to a doctor's wallet public key so only they can decrypt. */
  async shareToRecipient(
    data: Uint8Array,
    recipientPubKey: string,
  ): Promise<{ rootHash: string }> {
    // Normalize to a compressed public key.
    const compressed = ethers.SigningKey.computePublicKey(recipientPubKey, true)
    const mem = new MemData(data)
    const [tree, treeErr] = (await (mem as unknown as {
      merkleTree: () => Promise<Tuple<{ rootHash: () => string }>>
    }).merkleTree()) as Tuple<{ rootHash: () => string }>
    if (treeErr) throw new Error(String(treeErr))
    const rootHash = (tree as { rootHash: () => string }).rootHash()

    const [, upErr] = (await (this.indexer as unknown as {
      upload: (
        b: unknown,
        rpc: string,
        signer: ethers.Signer,
        opts: unknown,
      ) => Promise<Tuple<unknown>>
    }).upload(mem, ZG.RPC_URL, this.signer, {
      encryption: { type: 'ecies', recipientPubKey: compressed },
      finalityRequired: false,
    })) as Tuple<unknown>
    if (upErr) throw new Error(String(upErr))
    return { rootHash }
  }

  /**
   * Full integrity check: downloads with proof:true so the 0G SDK
   * re-verifies the Merkle proof against the stored root hash. This is a
   * genuine tamper-detection check, not just a presence probe.
   */
  async verifyIntegrity(rootHash: string): Promise<boolean> {
    try {
      // Download with proof:true to force Merkle re-verification.
      // If the file has been tampered with or pruned, this will fail.
      const [, err] = (await (this.indexer as unknown as {
        downloadToBlob: (
          root: string,
          opts: unknown,
        ) => Promise<Tuple<unknown>>
      }).downloadToBlob(rootHash, {
        proof: true,
      })) as Tuple<unknown>
      if (err) {
        console.warn('0G integrity check failed (file may be tampered or unavailable):', err)
        return false
      }
      return true
    } catch (e) {
      console.warn('0G integrity check error:', e)
      return false
    }
  }

  /** null = plaintext, 'v1' = aes256, 'v2' = ecies. */
  async detectMode(rootHash: string): Promise<unknown> {
    const [header, headerErr] = (await (this.indexer as unknown as {
      peekHeader: (root: string) => Promise<Tuple<unknown>>
    }).peekHeader(rootHash)) as Tuple<unknown>
    if (headerErr) throw new Error(String(headerErr))
    return header
  }

  /** Download ECIES ciphertext from 0G and decrypt using private key. */
  async downloadDecryptedShared(
    rootHash: string,
    privateKey: string,
  ): Promise<Uint8Array> {
    const [blob, err] = (await (this.indexer as unknown as {
      downloadToBlob: (
        root: string,
        opts: unknown,
      ) => Promise<Tuple<Blob>>
    }).downloadToBlob(rootHash, {
      proof: false,
      decryption: { privateKey },
    })) as Tuple<Blob>
    if (err) throw new Error(String(err))
    const buf = await (blob as Blob).arrayBuffer()
    return new Uint8Array(buf)
  }
}

/** Node/server-side factory (used only for optional server ops). */
export function createServerStorageAdapter(privateKey: string): OgStorageAdapter {
  const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
  const signer = new ethers.Wallet(privateKey, provider)
  return new OgStorageAdapter(signer)
}
