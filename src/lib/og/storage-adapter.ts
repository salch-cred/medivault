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
import { applyNodeProxy, clearShardedCache } from './proxy'
import type { StorageAdapter } from './adapters'

type Tuple<T> = [T, unknown]

type ProgressFn = (message: string) => void

type ReadOpts = { expectExists?: boolean }

// Marker error so we can distinguish our own upload-stall timeout from real
// errors thrown by the SDK.
const SYNC_TIMEOUT_MARKER = 'MEDIVAULT_SYNC_TIMEOUT'

// Max time to wait for a single SDK upload() (dominated by the storage node
// log-sync). The SDK's waitForLogEntry() loops forever, so we must bound it.
const SYNC_TIMEOUT_MS = 70_000
// How many times we re-select a fresher node after a sync stall.
const MAX_SYNC_TIMEOUTS = 2

// ── Read-path propagation retry ───────────────────
// Right after a successful upload the file is on-chain and on the storage node,
// but the indexer's getFileLocations can briefly return empty / "file not
// found" until the node finishes syncing the submission block and the indexer
// reflects it. Reads (download / verify / detectMode) must wait that out
// instead of erroring immediately.
const NOT_FOUND_RE =
  /no locations found|file not found|not found|no location|cannot form a complete shard|no known locations/i

// Recently-uploaded roots get a long, patient retry budget (they WILL become
// locatable once indexed). Everything else fails fast so genuinely old/missing
// records don't hang the UI. Module-level so it survives adapter re-creation
// within the same browser session (upload + read happen in one JS context).
const recentUploads = new Map<string, number>()
const RECENT_UPLOAD_WINDOW_MS = 10 * 60_000
const READ_RETRY_INTERVAL_MS = 6_000
// Shared links poll faster so the recipient sees the record the moment it
// propagates, rather than waiting out a long fixed interval.
const READ_RETRY_INTERVAL_EXPECT_MS = 3_000
const READ_RETRY_ATTEMPTS_RECENT = 16 // ~90s of patient retries
// Shared/expected reads: ~90s of fast, patient retries (30 x 3s).
const READ_RETRY_ATTEMPTS_EXPECT = 30
const READ_RETRY_ATTEMPTS_DEFAULT = 2 // quick fail for old/missing roots

function markRecentUpload(rootHash?: string): void {
  if (typeof rootHash === 'string' && rootHash) {
    recentUploads.set(rootHash.toLowerCase(), Date.now())
  }
}
function wasRecentlyUploaded(rootHash: string): boolean {
  const t = recentUploads.get(rootHash.toLowerCase())
  return t !== undefined && Date.now() - t < RECENT_UPLOAD_WINDOW_MS
}

/** Reject with a marker error if `p` doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(SYNC_TIMEOUT_MARKER)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

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
   * Warm the upload path before the user actually uploads. Triggering node
   * selection now (a) warms the edge proxies + indexer connection and (b)
   * populates the short-lived sharded-node cache (sorted by sync height) in
   * proxy.ts, so the real upload's node selection is effectively instant.
   * Best-effort: failures are ignored.
   */
  async prewarm(): Promise<void> {
    try {
      await (this.indexer as unknown as {
        getShardedNodes: () => Promise<unknown>
      }).getShardedNodes()
    } catch {
      // ignore -- this is purely an optimization
    }
  }

  /**
   * Retry a 0G read while a file is still propagating to the indexer. Only
   * "not found / no locations" errors are retried; genuine errors (tampered
   * proof, wrong key, malformed) surface immediately.
   *
   * A read is treated as "patient" (long budget) when EITHER the root was
   * uploaded this session OR the caller passes expectExists:true (e.g. a share
   * link, which by definition points to a file the sender just uploaded). All
   * other roots fail fast so old or genuinely-missing records don't freeze the
   * UI.
   */
  private async withReadRetry<T>(
    rootHash: string,
    op: () => Promise<T>,
    onProgress?: ProgressFn,
    opts?: ReadOpts,
  ): Promise<T> {
    const expectExists = opts?.expectExists === true
    const recent = wasRecentlyUploaded(rootHash)
    const patient = recent || expectExists
    const maxAttempts = expectExists
      ? READ_RETRY_ATTEMPTS_EXPECT
      : recent
        ? READ_RETRY_ATTEMPTS_RECENT
        : READ_RETRY_ATTEMPTS_DEFAULT
    const intervalMs = expectExists
      ? READ_RETRY_INTERVAL_EXPECT_MS
      : READ_RETRY_INTERVAL_MS
    let lastErr: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await op()
      } catch (e) {
        lastErr = e
        if (!NOT_FOUND_RE.test(String(e))) throw e // real error -> surface now
        if (attempt < maxAttempts - 1) {
          if (patient) {
            onProgress?.(
              `Still syncing across 0G storage nodes… retrying (${attempt + 1}/${maxAttempts - 1})`,
            )
          } else {
            onProgress?.('Looking for the file on 0G…')
          }
          console.warn(
            `0G read: "${rootHash}" not yet locatable (attempt ${attempt + 1}/${maxAttempts}); ${patient ? 'expected to exist -- waiting for propagation' : 'not a recent upload -- failing fast'}.`,
          )
          await new Promise((r) => setTimeout(r, intervalMs))
        }
      }
    }
    throw lastErr
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
   * Evict any transaction stuck in the mempool before we submit a new one.
   *
   * The REPLACEMENT_UNDERPRICED loop happens because a prior Flow `submit` tx
   * is still pending at the wallet's current nonce: the SDK reuses that nonce,
   * and a floor-based gas bump rarely beats the stuck tx by the required 110%.
   * Here we detect the gap (pending nonce > latest mined nonce) and, for each
   * stuck nonce, broadcast a 0-value self-transfer whose gasPrice escalates
   * (4x floor, doubling on each 'underpriced' rejection) until it replaces the
   * stuck tx and mines. Afterwards the SDK submits on a fresh, clean nonce.
   *
   * Fully best-effort: any unexpected error is swallowed so the normal upload
   * retry path still runs.
   */
  private async clearStuckNonce(): Promise<void> {
    const provider = (this.signer as ethers.Signer & {
      provider?: ethers.Provider | null
    }).provider
    if (!provider) return

    let address: string
    try {
      address = await this.signer.getAddress()
    } catch {
      return
    }

    let latest: number
    let pending: number
    try {
      ;[latest, pending] = await Promise.all([
        provider.getTransactionCount(address, 'latest'),
        provider.getTransactionCount(address, 'pending'),
      ])
    } catch {
      return
    }

    if (pending <= latest) return // nothing stuck

    const floor = (await this.networkGasPrice()) ?? 1_000_000_000n // 1 gwei fallback
    console.warn(
      `Detected ${pending - latest} stuck pending transaction(s) (nonce ${latest}..${pending - 1}); clearing before upload.`,
    )

    for (let nonce = latest; nonce < pending; nonce++) {
      let gasPrice = floor * 4n
      for (let i = 0; i < 6; i++) {
        try {
          const tx = await this.signer.sendTransaction({
            to: address,
            value: 0n,
            nonce,
            gasPrice,
          })
          await tx.wait(1)
          break // this nonce is cleared
        } catch (e) {
          const s = String(e)
          // Still underpriced vs the stuck tx -> double and try again.
          if (/replacement|underpriced|fee too low|max fee per gas/i.test(s)) {
            gasPrice = gasPrice * 2n
            continue
          }
          // Already mined / nonce consumed / unknown -> stop on this nonce.
          break
        }
      }
    }
  }

  /**
   * Upload a prepared blob through the 0G SDK with smart, gas-aware retries and
   * a bounded wait for storage-node sync.
   *
   * Two independent failure modes are handled:
   *  - Stuck-nonce / underpriced submit tx: we clear the stuck nonce, start
   *    above the gas floor, and escalate each retry (>=110% replaces a pending
   *    tx).
   *  - Storage-node sync stall: the SDK's waitForLogEntry() loops forever when
   *    a selected node lags chain head. We bound each upload() with a timeout,
   *    bust the node cache to re-evaluate sync heights, and retry on a fresher
   *    node. The retry's findExistingFileInfo skips re-submission once any node
   *    has synced the entry, so it usually costs no extra storage fee.
   */
  private async uploadWithRetry(
    blob: unknown,
    uploadOpts: unknown,
  ): Promise<{ txHash?: string } | string | undefined> {
    await this.assertIndexerHasNodes()
    // Pre-flight: unstick any leftover pending tx so the SDK gets a clean nonce.
    await this.clearStuckNonce()

    const onProgress = (uploadOpts as { onProgress?: ProgressFn } | undefined)
      ?.onProgress

    const floor = await this.networkGasPrice()
    // First attempt: ~2x floor for fast (often single-block) inclusion.
    let gasPrice = floor !== undefined ? (floor * 200n) / 100n : undefined

    const maxRetries = 8
    let syncTimeouts = 0
    let tx: { txHash?: string } | string | undefined
    let lastErr: unknown

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const txOpts = gasPrice !== undefined ? { gasPrice } : undefined

      let attemptTx: { txHash?: string } | string | undefined
      let attemptErr: unknown
      try {
        const res = (await withTimeout(
          (this.indexer as unknown as { upload: SdkUpload }).upload(
            blob,
            ZG.RPC_URL,
            this.signer,
            uploadOpts,
            undefined,
            txOpts,
          ),
          SYNC_TIMEOUT_MS,
        )) as Tuple<{ txHash?: string } | string>
        attemptTx = res[0]
        attemptErr = res[1]
      } catch (e) {
        if (e instanceof Error && e.message === SYNC_TIMEOUT_MARKER) {
          // The storage node we're waiting on is lagging chain head. Re-select.
          syncTimeouts++
          clearShardedCache() // force re-poll of node logSyncHeight
          if (syncTimeouts > MAX_SYNC_TIMEOUTS) {
            throw new Error(
              'The 0G storage nodes are lagging right now and did not sync your upload in time. Your submission transaction is already on-chain -- please try again in a few minutes once the network catches up.',
            )
          }
          console.warn(
            `0G upload stalled waiting for storage node sync; re-selecting a fresher node (sync retry ${syncTimeouts}/${MAX_SYNC_TIMEOUTS}).`,
          )
          onProgress?.(
            'Storage nodes are lagging — switching to a fresher node and retrying…',
          )
          // The abandoned attempt already submitted; clean up any nonce gap and
          // retry without escalating gas (this isn't a fee problem).
          await this.clearStuckNonce()
          await new Promise((r) => setTimeout(r, 1500))
          continue
        }
        // A genuine thrown error -- fall through to the tuple-error handling.
        attemptErr = e
        attemptTx = undefined
      }

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
        // An underpriced error means a tx is stuck again -- evict it so the next
        // attempt submits on a clean nonce rather than re-fighting the mempool.
        if (isUnderpriced) {
          await this.clearStuckNonce()
        }
        // Ensure we have a base price even if the first lookup failed.
        if (gasPrice === undefined) {
          const f = await this.networkGasPrice()
          gasPrice = f !== undefined ? (f * 200n) / 100n : undefined
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

  /**
   * Phase 1 of an upload: build the blob and compute its Merkle rootHash
   * LOCALLY (no network). This lets the caller persist + display the record
   * INSTANTLY, then finalize the actual (slow, on-chain) 0G storage in the
   * background via the returned finalize() closure.
   *
   * finalize() runs the same gas-aware, sync-bounded upload as a normal
   * uploadEncrypted and marks the root as recently-uploaded so the read path
   * waits patiently for propagation.
   */
  async prepareUpload(
    data: Uint8Array | File,
    key: Uint8Array,
  ): Promise<{
    rootHash: string
    finalize: (onProgress?: ProgressFn) => Promise<{ txHash?: string }>
  }> {
    const blob: unknown =
      typeof File !== 'undefined' && data instanceof File
        ? new ZgBlob(data)
        : new MemData(data as Uint8Array)

    const [tree, treeErr] = (await (blob as {
      merkleTree: () => Promise<Tuple<{ rootHash: () => string }>>
    }).merkleTree()) as Tuple<{ rootHash: () => string }>
    if (treeErr) throw new Error(String(treeErr))
    const rootHash = (tree as { rootHash: () => string }).rootHash()

    const finalize = async (
      onProgress?: ProgressFn,
    ): Promise<{ txHash?: string }> => {
      const tx = await this.uploadWithRetry(blob, {
        encryption: { type: 'aes256', key },
        finalityRequired: false,
        onProgress,
      })
      // Remember this root so the read path waits patiently for propagation.
      markRecentUpload(rootHash)
      const txHash =
        typeof tx === 'string'
          ? tx
          : (tx as { txHash?: string } | undefined)?.txHash
      return { txHash }
    }

    return { rootHash, finalize }
  }

  /** AES-256 encrypted upload of a File (browser) or in-memory bytes. */
  async uploadEncrypted(
    data: Uint8Array | File,
    key: Uint8Array,
    onProgress?: ProgressFn,
  ): Promise<{ rootHash: string; txHash?: string }> {
    const { rootHash, finalize } = await this.prepareUpload(data, key)
    const { txHash } = await finalize(onProgress)
    return { rootHash, txHash }
  }

  /** Download ciphertext from 0G and AES-256 decrypt to bytes. */
  async downloadDecrypted(
    rootHash: string,
    key: Uint8Array,
    onProgress?: ProgressFn,
    opts?: ReadOpts,
  ): Promise<Uint8Array> {
    return this.withReadRetry(
      rootHash,
      async () => {
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
      },
      onProgress,
      opts,
    )
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
    markRecentUpload(rootHash)
    return { rootHash }
  }

  /**
   * Full integrity check: downloads with proof:true so the 0G SDK
   * re-verifies the Merkle proof against the stored root hash. This is a
   * genuine tamper-detection check, not just a presence probe.
   *
   * Wrapped in withReadRetry so a just-uploaded file that hasn't propagated to
   * the indexer yet doesn't report a false "integrity failed" -- it waits for
   * the file to become locatable, then verifies the Merkle proof for real.
   */
  async verifyIntegrity(
    rootHash: string,
    onProgress?: ProgressFn,
    opts?: ReadOpts,
  ): Promise<boolean> {
    try {
      await this.withReadRetry(
        rootHash,
        async () => {
          // Download with proof:true to force Merkle re-verification.
          const [, err] = (await (this.indexer as unknown as {
            downloadToBlob: (
              root: string,
              opts: unknown,
            ) => Promise<Tuple<unknown>>
          }).downloadToBlob(rootHash, {
            proof: true,
          })) as Tuple<unknown>
          if (err) throw new Error(String(err))
          return true
        },
        onProgress,
        opts,
      )
      return true
    } catch (e) {
      console.warn(
        '0G integrity check failed (file may be tampered or unavailable):',
        e,
      )
      return false
    }
  }

  /** null = plaintext, 'v1' = aes256, 'v2' = ecies. */
  async detectMode(rootHash: string, opts?: ReadOpts): Promise<unknown> {
    return this.withReadRetry(
      rootHash,
      async () => {
        const [header, headerErr] = (await (this.indexer as unknown as {
          peekHeader: (root: string) => Promise<Tuple<unknown>>
        }).peekHeader(rootHash)) as Tuple<unknown>
        if (headerErr) throw new Error(String(headerErr))
        return header
      },
      undefined,
      opts,
    )
  }

  /** Download ECIES ciphertext from 0G and decrypt using private key. */
  async downloadDecryptedShared(
    rootHash: string,
    privateKey: string,
    onProgress?: ProgressFn,
    opts?: ReadOpts,
  ): Promise<Uint8Array> {
    return this.withReadRetry(
      rootHash,
      async () => {
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
      },
      onProgress,
      // A share link always points to a file the sender just uploaded, so the
      // recipient (who has no local "recent upload" record) must still wait
      // patiently for it to propagate rather than failing fast after 2 tries.
      { expectExists: true, ...opts },
    )
  }
}

/** Node/server-side factory (used only for optional server ops). */
export function createServerStorageAdapter(privateKey: string): OgStorageAdapter {
  const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
  const signer = new ethers.Wallet(privateKey, provider)
  return new OgStorageAdapter(signer)
}
