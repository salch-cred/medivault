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

// 0G SDK upload() positional signature (typings can trail the runtime API):
//   upload(file, blockchainRpc, signer, uploadOpts?, retryOpts?, txOpts?)
// txOpts is { gasPrice?: bigint; gasLimit?: bigint } and, when gasPrice > 0,
// is used verbatim for the on-chain Flow `submit` transaction.
type SdkUpload = (
  blob: unknown,
  rpc: string,
  signer: ethers.Signer,
  uploadOpts: unknown,
  retryOpts?: unknown,
  txOpts?: { gasPrice?: bigint; gasLimit?: bigint },
) => Promise<Tuple<{ txHash?: string } | string>>

export class OgStorageAdapter implements StorageAdapter {
  private readonly indexer: Indexer
  private readonly signer: ethers.Signer

  constructor(signer: ethers.Signer, indexerRpc: string = ZG.INDEXER_RPC) {
    this.signer = signer
    this.indexer = new Indexer(indexerRpc)
    applyNodeProxy(this.indexer)
  }

  /**
   * Pre-flight check: make sure the indexer actually returns trusted storage
   * nodes before we kick off an upload. If the indexer/proxy is misconfigured
   * or the network is unavailable, getShardedNodes() resolves to undefined and
   * the SDK later crashes deep inside selectNodes with the opaque error
   * "Cannot read properties of undefined (reading 'trusted')". This converts
   * that into a clear, actionable message.
   *
   * Best-effort: a thrown error here (network/transient) is swallowed so the
   * normal upload retry loop can handle it. We only hard-fail when the indexer
   * is reachable AND explicitly reports zero available nodes.
   */
  private async assertIndexerHasNodes(): Promise<void> {
    let trusted: unknown[] | undefined
    try {
      const sharded = await (this.indexer as unknown as {
        getShardedNodes: () => Promise<{ trusted?: unknown[] } | undefined>
      }).getShardedNodes()
      trusted = sharded?.trusted
    } catch {
      // Network/transient error -- let the upload retry loop deal with it.
      return
    }
    if (trusted !== undefined && (!Array.isArray(trusted) || trusted.length === 0)) {
      throw new Error(
        'The 0G storage indexer returned no available nodes right now. The network may be busy or temporarily unreachable -- please try again in a moment.',
      )
    }
  }

  /** Current network gas price (bigint) from the signer's provider, or undefined. */
  private async networkGasPrice(): Promise<bigint | undefined> {
    try {
      const provider = (this.signer as ethers.Signer & {
        provider?: ethers.Provider | null
      }).provider
      if (!provider) return undefined
      const feeData = await provider.getFeeData()
      return feeData.gasPrice ?? undefined
    } catch {
      return undefined
    }
  }

  /**
   * Upload a prepared blob through the 0G SDK with smart, gas-aware retries.
   *
   * Why explicit gas handling: the SDK submits the Flow `submit` tx at the
   * provider's suggested gasPrice when no gasPrice is supplied. Repeated
   * attempts therefore reuse the same (latest) nonce at the same floor price,
   * so the first attempt sticks in the mempool and every retry is rejected
   * with "replacement fee too low" / REPLACEMENT_UNDERPRICED. We instead start
   * slightly above floor and escalate each retry (>=110% is required to
   * replace a pending tx), which also clears any tx stuck from earlier runs.
   */
  private async uploadWithRetry(
    blob: unknown,
    uploadOpts: unknown,
  ): Promise<{ txHash?: string } | string | undefined> {
    await this.assertIndexerHasNodes()

    const floor = await this.networkGasPrice()
    // First attempt: ~1.25x floor to avoid an immediate underprice rejection.
    let gasPrice = floor !== undefined ? (floor * 125n) / 100n : undefined

    const maxRetries = 6
    let tx: { txHash?: string } | string | undefined
    let lastErr: unknown

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const txOpts = gasPrice !== undefined ? { gasPrice } : undefined

      const [attemptTx, attemptErr] = (await (
        this.indexer as unknown as { upload: SdkUpload }
      ).upload(
        blob,
        ZG.RPC_URL,
        this.signer,
        uploadOpts,
        undefined,
        txOpts,
      )) as Tuple<{ txHash?: string } | string>

      tx = attemptTx
      lastErr = attemptErr
      if (!lastErr) return tx

      const errStr = String(lastErr)

      // Permanent errors: never retry.
      if (/insufficient funds|exceeds balance|invalid (sender|signature)|malformed/i.test(errStr)) {
        throw new Error(errStr)
      }

      // Stuck-nonce / fee problems: bump gas and retry.
      const isUnderpriced =
        /replacement (fee too low|transaction underpriced)|replacement_underpriced|underpriced|fee too low|max fee per gas|nonce too low/i.test(
          errStr,
        )
      // Generic network blips: also retryable (a bump is harmless).
      const isTransient =
        /network|timeout|connection|reset|ECONNREFUSED|ETIMEDOUT|fetch failed|socket hang up|502|503|504/i.test(
          errStr,
        )

      if (!isUnderpriced && !isTransient) {
        // Unknown error -- surface it rather than looping pointlessly.
        throw new Error(errStr)
      }

      if (attempt < maxRetries - 1) {
        // Ensure we have a base price even if the first lookup failed.
        if (gasPrice === undefined) {
          const f = await this.networkGasPrice()
          gasPrice = f !== undefined ? (f * 160n) / 100n : undefined
        } else {
          // ~1.6x per retry: comfortably above the 110% replacement threshold.
          gasPrice = (gasPrice * 160n) / 100n
        }
        const backoffMs = Math.min(1500 * 2 ** attempt, 12000)
        console.warn(
          `0G upload failed (${isUnderpriced ? 'underpriced/stuck-nonce' : 'transient'}); bumping gas to ${gasPrice ?? 'default'} and retrying in ${backoffMs}ms (${maxRetries - attempt - 1} left)`,
          attemptErr,
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }
    }

    throw new Error(String(lastErr))
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

    const tx = await this.uploadWithRetry(blob, {
      encryption: { type: 'aes256', key },
      finalityRequired: false,
    })

    const txHash =
      typeof tx === 'string' ? tx : (tx as { txHash?: string } | undefined)?.txHash
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

    await this.uploadWithRetry(mem, {
      encryption: { type: 'ecies', recipientPubKey: compressed },
      finalityRequired: false,
    })
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
