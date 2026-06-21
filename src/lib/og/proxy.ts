'use client'

/**
 * Shared monkey-patch for 0G SDK Indexer instances.
 *
 * The 0G SDK's getShardedNodes and getFileLocations return raw node URLs that
 * may not be reachable from the browser (CORS, firewall, etc.). We rewrite
 * them to proxy through our own /api/og/node endpoint.
 *
 * This was previously duplicated in both storage-adapter.ts and
 * kv-index-adapter.ts — extracted here to avoid copy-paste drift.
 */
export function applyNodeProxy(indexer: any): void {
  if (typeof window === 'undefined') return

  const originalGetShardedNodes = indexer.getShardedNodes.bind(indexer)
  indexer.getShardedNodes = async (...args: any[]) => {
    const res = await originalGetShardedNodes(...args)
    if (res && res.trusted) {
      res.trusted = res.trusted.map((node: any) => ({
        ...node,
        url: `${window.location.origin}/api/og/node?url=${encodeURIComponent(node.url)}`,
      }))
    }
    return res
  }

  const originalGetFileLocations = indexer.getFileLocations.bind(indexer)
  indexer.getFileLocations = async (...args: any[]) => {
    const res = await originalGetFileLocations(...args)
    if (Array.isArray(res)) {
      return res.map((loc: any) => ({
        ...loc,
        url: `${window.location.origin}/api/og/node?url=${encodeURIComponent(loc.url)}`,
      }))
    }
    return res
  }
}
