'use client'

/**
 * Shared monkey-patch for 0G SDK Indexer instances.
 *
 * The 0G SDK return shape differs across versions: some methods return the
 * object directly, others return a [value, error] tuple. This wrapper handles
 * both. The previous implementation assumed a direct object and could let
 * `undefined` propagate into the SDK, causing upload-time crashes like:
 *
 *   Cannot read properties of undefined (reading 'trusted')
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
  return {
    ...node,
    url: proxyUrl(node.url),
  }
}

function proxyLocation(loc: any): any {
  if (!loc || typeof loc !== 'object') return loc
  return {
    ...loc,
    url: proxyUrl(loc.url),
  }
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

export function applyNodeProxy(indexer: any): void {
  if (typeof window === 'undefined') return
  if (!indexer || indexer.__medivaultNodeProxyApplied) return
  indexer.__medivaultNodeProxyApplied = true

  if (typeof indexer.getShardedNodes === 'function') {
    const originalGetShardedNodes = indexer.getShardedNodes.bind(indexer)
    indexer.getShardedNodes = async (...args: any[]) => {
      const res = await originalGetShardedNodes(...args)

      // Tuple shape: [nodes, error]
      if (Array.isArray(res) && res.length >= 2) {
        const [nodes, err] = res
        return [proxyShardedNodes(nodes), err]
      }

      // Direct-object shape: nodes
      return proxyShardedNodes(res)
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
