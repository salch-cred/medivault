import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { Indexer } from '@0gfoundation/0g-storage-ts-sdk'
import { ZG } from '@/lib/og/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 25

// Reject a probe that hangs so one slow endpoint can't stall the whole report.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Probe timed out')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

type Probe<T> = { ok: boolean; ms: number; value?: T; error?: string }

async function timed<T>(fn: () => Promise<T>, ms = 9000): Promise<Probe<T>> {
  const start = Date.now()
  try {
    const value = await withTimeout(fn(), ms)
    return { ok: true, ms: Date.now() - start, value }
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  }
}

// Best-effort extraction of a node endpoint + shard info from the SDK's
// getShardedNodes() entries. Shapes vary across SDK patch versions, so we read
// defensively and fall back to an anonymized label rather than guessing wrong.
function normalizeNode(entry: unknown, index: number): { label: string; url?: string; shard?: string } {
  if (typeof entry === 'string') {
    return { label: entry, url: entry }
  }
  const e = (entry ?? {}) as Record<string, unknown>
  const url =
    (typeof e.url === 'string' && e.url) ||
    (typeof e.endpoint === 'string' && e.endpoint) ||
    (typeof e.rpcUrl === 'string' && e.rpcUrl) ||
    undefined
  const cfg = (e.config ?? e.shardConfig ?? {}) as Record<string, unknown>
  const numShard = typeof cfg.numShard === 'number' ? cfg.numShard : typeof e.numShard === 'number' ? e.numShard : undefined
  const shardId = typeof cfg.shardId === 'number' ? cfg.shardId : typeof e.shardId === 'number' ? e.shardId : undefined
  const shard =
    numShard !== undefined && shardId !== undefined
      ? `shard ${shardId}/${numShard}`
      : numShard !== undefined
        ? `${numShard} shards`
        : undefined
  let host = url
  if (url) {
    try {
      host = new URL(url).host
    } catch {
      host = url
    }
  }
  return { label: host || `0G node ${index + 1}`, url: url || undefined, shard }
}

export async function GET() {
  // 1) Chain liveness: latest mined block proves the 0G EVM chain is producing.
  const chain = await timed(async () => {
    const network = new ethers.Network('0g-mainnet', ZG.CHAIN_ID)
    const provider = new ethers.JsonRpcProvider(ZG.RPC_URL, network, { staticNetwork: network })
    const blockNumber = await provider.getBlockNumber()
    return { blockNumber }
  })

  // 2) Storage network: the live set of trusted/sharded 0G storage nodes the
  //    indexer is currently serving. This is the real "node map".
  const storage = await timed(async () => {
    const indexer = new Indexer(ZG.INDEXER_RPC)
    const sharded = (await (indexer as unknown as {
      getShardedNodes: () => Promise<{ trusted?: unknown[] }>
    }).getShardedNodes()) as { trusted?: unknown[] }
    const trusted = Array.isArray(sharded?.trusted) ? sharded.trusted : []
    return {
      total: trusted.length,
      nodes: trusted.slice(0, 30).map((n, i) => normalizeNode(n, i)),
    }
  })

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    chainName: ZG.CHAIN_NAME,
    chainId: ZG.CHAIN_ID,
    flowContract: ZG.FLOW_CONTRACT,
    blockExplorer: ZG.BLOCK_EXPLORER,
    storageExplorer: ZG.STORAGE_EXPLORER,
    chain: { url: ZG.RPC_URL, ...chain },
    storage: { url: ZG.INDEXER_RPC, ...storage },
  })
}
