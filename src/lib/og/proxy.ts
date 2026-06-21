'use client'

/**
 * Shared monkey-patch for 0G SDK Indexer instances.
 *
 * Responsibilities:
 *  1. Route all storage-node traffic through our same-origin /api/og/node proxy
 *     (CORS + HTTPS) -- see proxyUrl/proxyNode/proxyLocation.
 *  2. Build the upload node pool from BOTH the indexer's trusted AND discovered
 *     nodes, ranked by how far each has synced (logSyncHeight). The SDK's
 *     selectNodes() only reads `trusted` and, for numShard=1 nodes, keeps our
 *     order (stable sort), so ranking the most-synced node first directly cuts
 *     the long "Waiting for storage node to sync..." stall -- and merging in
 *     `discovered` lets uploads escape a fully-stalled trusted set.
 *  3. Cache the (sorted, proxied) sharded-node list for a few seconds so
 *     pre-warming actually saves time and retries don't re-poll every node.
 */

function proxyUrl(url: unknown): unknown {
  if (typeof window === 'undefined') return url
  if (typeof url !== 'string' || !url) return url
  // Avoid double-proxying URLs that are already routed through our API.
  if (url.includes('/api/og/node?url=')) return url
  return `${window.location.origin}/api/og/node?url=${encodeURIComponent(url)}`
}

function proxyNode(node: any): any {
  if (!node || typeof node !== 'object') return node
  return { ...node, url: proxyUrl(node.url) }
}

function proxyLocation(loc: any): any {
  if (!loc || typeof loc !== 'object') return loc
  return { ...loc, url: proxyUrl(loc.url) }
}

function proxyShardedNodes(value: any): any {
  if (!value || typeof value !== 'object') return value

  // Shape: { trusted: Node[], discovered?: Node[] }
  if (Array.isArray(value.trusted)) {
    return {
      ...value,
      trusted: value.trusted.map(proxyNode),
      discovered: Array.isArray(value.discovered)
        ? value.discovered.map(proxyNode)
        : value.discovered,
    }
  }

  return value
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Query a node's zgs_getStatus (through our proxy) and return its logSyncHeight.
// Returns -1 on any failure so dead/slow nodes sort to the bottom.
async function nodeLogSyncHeight(rawUrl: unknown): Promise<number> {
  if (typeof rawUrl !== 'string' || !rawUrl) return -1
  try {
    const res = await fetchWithTimeout(
      proxyUrl(rawUrl) as string,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'zgs_getStatus',
          params: [],
          id: 1,
        }),
      },
      3000,
    )
    if (!res.ok) return -1
    const json: any = await res.json()
    const h = json?.result?.logSyncHeight
    const n = typeof h === 'number' ? h : Number(h)
    return Number.isFinite(n) ? n : -1
  } catch {
    return -1
  }
}

// Current chain head (eth_blockNumber) via our same-origin RPC proxy, or -1.
// Used to tell "slightly behind" nodes (fine) from "stalled" nodes (bad).
async function chainHeadBlock(): Promise<number> {
  if (typeof window === 'undefined') return -1
  try {
    const res = await fetchWithTimeout(
      `${window.location.origin}/api/og/rpc`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      },
      3000,
    )
    if (!res.ok) return -1
    const json: any = await res.json()
    const hex = json?.result
    if (typeof hex !== 'string') return -1
    const n = parseInt(hex, 16)
    return Number.isFinite(n) ? n : -1
  } catch {
    return -1
  }
}

// A node is considered "stalled" (vs merely lagging) when it trails chain head
// by more than this many blocks. Slightly-behind nodes still get picked; they
// just need a few seconds to sync the just-submitted entry.
const STALL_LAG_BLOCKS = 100

// Build the upload candidate pool: merge trusted + discovered (deduped by url),
// score each by logSyncHeight, and return them most-synced first. The SDK reads
// only `trusted` and, via a stable sort in selectNodes('min'), preserves this
// order for same-shard nodes -- so node[0] is the most-synced node available
// across the WHOLE network, not just the (possibly stalled) trusted subset.
async function buildRankedPool(trusted: any[], discovered: any[]): Promise<any[]> {
  const merged: any[] = []
  const seen = new Set<string>()
  for (const node of [
    ...(Array.isArray(trusted) ? trusted : []),
    ...(Array.isArray(discovered) ? discovered : []),
  ]) {
    const u = node?.url
    if (typeof u === 'string' && u && !seen.has(u)) {
      seen.add(u)
      merged.push(node)
    }
  }
  if (merged.length <= 1) return merged

  const [scored, head] = await Promise.all([
    Promise.all(
      merged.map(async (node) => ({ node, h: await nodeLogSyncHeight(node?.url) })),
    ),
    chainHeadBlock(),
  ])

  scored.sort((a, b) => b.h - a.h)

  const best = scored[0]?.h ?? -1
  if (head > 0 && best >= 0 && best < head - STALL_LAG_BLOCKS) {
    console.warn(
      `0G: all ${scored.length} storage nodes are lagging (best logSyncHeight=${best}, chain head=${head}, lag=${head - best} blocks). This is a network-side delay; uploads may stall until nodes catch up.`,
    )
  } else if (head > 0) {
    console.log(
      `0G: ranked ${scored.length} candidate nodes; best logSyncHeight=${best} (chain head=${head}, lag=${Math.max(0, head - best)}).`,
    )
  }

  return scored.map((s) => s.node)
}

// Short-lived cache of the sorted + proxied sharded-node result. Lets prewarm()
// populate it during the (slow) AI step so the real upload's node selection is
// instant, and prevents retries from re-polling every node's status.
let shardedCache: { at: number; value: any } | null = null
const SHARDED_TTL_MS = 8000

// Invalidate the sharded-node cache. Called when an upload times out waiting for
// a lagging node to sync, so the next attempt re-polls logSyncHeight and can
// pick a fresher node (a previously-stalled node sorts to the bottom).
export function clearShardedCache(): void {
  shardedCache = null
}

export function applyNodeProxy(indexer: any): void {
  if (typeof window === 'undefined') return
  if (!indexer || indexer.__medivaultNodeProxyApplied) return
  indexer.__medivaultNodeProxyApplied = true

  if (typeof indexer.getShardedNodes === 'function') {
    const originalGetShardedNodes = indexer.getShardedNodes.bind(indexer)
    indexer.getShardedNodes = async (...args: any[]) => {
      if (shardedCache && Date.now() - shardedCache.at < SHARDED_TTL_MS) {
        return shardedCache.value
      }

      const res = await originalGetShardedNodes(...args)

      const isTuple = Array.isArray(res) && res.length >= 2
      let nodes = isTuple ? res[0] : res
      const err = isTuple ? res[1] : null

      if (
        nodes &&
        (Array.isArray(nodes.trusted) || Array.isArray(nodes.discovered))
      ) {
        // Merge trusted + discovered and rank by sync height. The SDK uploads
        // only from `trusted`, so we put the best whole-network candidates there.
        const ranked = await buildRankedPool(nodes.trusted, nodes.discovered)
        nodes = { ...nodes, trusted: ranked }
      }

      const proxied = proxyShardedNodes(nodes)
      const value = isTuple ? [proxied, err] : proxied
      shardedCache = { at: Date.now(), value }
      return value
    }
  }

  if (typeof indexer.getFileLocations === 'function') {
    const originalGetFileLocations = indexer.getFileLocations.bind(indexer)
    indexer.getFileLocations = async (...args: any[]) => {
      const res = await originalGetFileLocations(...args)

      // Tuple shape: [locations, error]
      if (Array.isArray(res) && res.length >= 2 && Array.isArray(res[0])) {
        const [locations, err] = res
        return [locations.map(proxyLocation), err]
      }

      // Direct array shape: locations[]
      if (Array.isArray(res)) return res.map(proxyLocation)

      return res
    }
  }
}
