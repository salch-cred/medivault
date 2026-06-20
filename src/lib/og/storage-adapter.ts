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
import type { StorageAdapter } from './adapters'

type Tuple<T> = [T, unknown]

export class OgStorageAdapter implements StorageAdapter {
  private readonly indexer: Indexer
  private readonly signer: ethers.Signer

  constructor(signer: ethers.Signer, indexerRpc: string = ZG.INDEXER_RPC) {
    this.signer = signer
    this.indexer = new Indexer(indexerRpc)
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

    // Flaky 0G testnet RPC nodes often drop connections causing "Network Error".
    // We wrap the upload in a retry loop.
    let tx: unknown
    let upErr: unknown
    let retries = 3
    while (retries > 0) {
      const [attemptTx, attemptErr] = (await (this.indexer as unknown as {
        upload: (
          b: unknown,
          rpc: string,
          signer: ethers.Signer,
          opts: unknown,
        ) => Promise<Tuple<{ txHash?: string } | string>>
      }).upload(blob, ZG.RPC_URL, this.signer, {
        encryption: { type: 'aes256', key },
      })) as Tuple<{ txHash?: string } | string>
      
      tx = attemptTx
      upErr = attemptErr
      if (!upErr) break
      
      retries--
      if (retries > 0) {
        console.warn(`0G upload failed, retrying... (${retries} attempts left)`, attemptErr)
        await new Promise(r => setTimeout(r, 1500))
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
      // proof: true verifies the Merkle proof during download so a
      // compromised KV/indexer node cannot serve tampered ciphertext.
      proof: true,
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
    })) as Tuple<unknown>
    if (upErr) throw new Error(String(upErr))
    return { rootHash }
  }

  /**
   * Real integrity check: read the stored file header via peekHeader. A non-null
   * header means 0G can still locate the file at this root hash; a null/err
   * result means it is missing or the root does not resolve (tampered/pruned).
   *
   * This is a presence + header check rather than a full Merkle re-verification
   * (downloads with proof:true already do that), but it is honest: the previous
   * implementation always returned true after an 800ms sleep, which surfaced a
   * false "verified" guarantee to the user.
   */
  async verifyIntegrity(rootHash: string): Promise<boolean> {
    try {
      const [header, headerErr] = (await (this.indexer as unknown as {
        peekHeader: (root: string) => Promise<Tuple<unknown>>
      }).peekHeader(rootHash)) as Tuple<unknown>
      if (headerErr) {
        // On testnet, transient node errors are common; surface as "unverified"
        // rather than a hard failure so the user is told the truth.
        console.warn('0G integrity check error (root may be unavailable):', headerErr)
        return false
      }
      return header != null
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
}

/** Node/server-side factory (used only for optional server ops). */
export function createServerStorageAdapter(privateKey: string): OgStorageAdapter {
  const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
  const signer = new ethers.Wallet(privateKey, provider)
  return new OgStorageAdapter(signer)
}
