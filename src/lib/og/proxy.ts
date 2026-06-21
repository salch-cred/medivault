'use client'

/**
 * Shared monkey-patch for 0G SDK Indexer instances.
 *
 * Responsibilities:
 *  1. Route all storage-node traffic through our same-origin /api/og/node proxy
 *     (CORS + HTTPS) -- see proxyUrl/proxyNode/proxyLocation.
 *  2. Reorder the indexer's trusted nodes so the MOST-SYNCED node is tried
 *     first. The SDK uses clients[0] for status/coverage, and an out-of-sync
 *     node causes the long "Waiting for storage node to sync..." stall that
 *     dominates upload latency.
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

// Reorder trusted nodes: most-synced (highest logSyncHeight) first. The SDK
// picks clients[0] for status + the covering set, so this directly cuts the
// "waiting for storage node to sync" wait that dominates upload time.
async function orderTrustedBySync(trusted: any[]): Promise<any[]> {
  if (!Array.isArray(trusted) || trusted.length <= 1) return trusted
  const scored = await Promise.all(
    trusted.map(async (node) => ({ node, h: await nodeLogSyncHeight(node?.url) })),
  )
  scored.sort((a, b) => b.h - a.h)
  return scored.map((s) => s.node)
}

// Short-lived cache of the sorted + proxied sharded-node result. Lets prewarm()
// populate it during the (slow) AI step so the real upload's node selection is
// instant, and prevents retries from re-polling every node's status.
let shardedCache: { at: number; value: any } | null = null
const SHARDED_TTL_MS = 8000

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

      if (nodes && Array.isArray(nodes.trusted)) {
        const ordered = await orderTrustedBySync(nodes.trusted)
        nodes = { ...nodes, trusted: ordered }
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
