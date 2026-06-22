'use client'

/**
 * Lightweight 0G SDK proxy patch.
 *
 * Keep only the part we truly need for production stability:
 *   - route storage-node URLs returned by the 0G indexer through our same-origin
 *     /api/og/node proxy so browser CORS/HTTPS works reliably.
 *
 * The previous version tried to rank every storage node by polling
 * zgs_getStatus/logSyncHeight and comparing against chain head. That created a
 * lot of extra network traffic, console noise, and made the vault feel slow.
 * Upload retry logic in storage-adapter.ts is now responsible for handling
 * temporary network lag; this file stays fast and side-effect-light.
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

  if (Array.isArray(value.trusted) || Array.isArray(value.discovered)) {
    return {
      ...value,
      trusted: Array.isArray(value.trusted)
        ? value.trusted.map(proxyNode)
        : value.trusted,
      discovered: Array.isArray(value.discovered)
        ? value.discovered.map(proxyNode)
        : value.discovered,
    }
  }

  return value
}

// Short-lived cache of the proxied sharded-node result. This avoids repeatedly
// re-processing the same indexer result without performing any active polling.
let shardedCache: { at: number; value: any } | null = null
const SHARDED_TTL_MS = 30_000

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
      const nodes = isTuple ? res[0] : res
      const err = isTuple ? res[1] : null

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
