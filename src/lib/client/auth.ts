'use client'

import { ethers } from 'ethers'

/**
 * Browser helper that builds the `x-medivault-auth` header expected by protected
 * MediVault API routes.
 *
 * IMPORTANT: this must only be used for MediVault same-origin API calls that
 * actually require app auth. Direct 0G RPC/indexer calls do not need this header
 * and must not ask the user's main wallet to sign during upload.
 */

const AUTH_CACHE_TTL_MS = 70 * 1000 // 70s — under the server's 90s MAX_SKEW_MS

type CachedAuth = { header: string; ts: number }

// FIX: auth header cache moved from sessionStorage to an in-memory Map.
// Previously, the wallet signature (valid for 70s) was stored in
// sessionStorage, which is accessible to XSS attacks. While the master seed
// was correctly moved to memory-only storage, the auth cache still leaked
// a replayable signature. Now we keep it in a module-level Map that is not
// accessible to DOM scripts.
const authCache = new Map<string, CachedAuth>()

export function getCachedAuthHeader(address: string | null): string | null {
  if (!address) return null
  const key = address.toLowerCase()
  const cached = authCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.ts > AUTH_CACHE_TTL_MS) {
    authCache.delete(key)
    return null
  }
  return cached.header
}

function writeCached(address: string, header: string, ts: number): void {
  authCache.set(address.toLowerCase(), { header, ts })
}

/** Clear the in-memory auth cache for an address (useful on disconnect). */
export function clearAuthCache(address?: string | null): void {
  if (address) {
    authCache.delete(address.toLowerCase())
  } else {
    authCache.clear()
  }
}

function generateNonce(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildAuthHeader(
  signer: ethers.Signer | null,
  address: string | null,
): Promise<string | null> {
  if (!signer || !address) return null
  const cached = getCachedAuthHeader(address)
  if (cached) return cached

  const ts = Date.now()
  const nonce = generateNonce()
  const message = `${address}|${ts}|${nonce}`
  try {
    const signature = await signer.signMessage(message)
    const header = `${address}|${ts}|${nonce}|${signature}`
    writeCached(address, header, ts)
    return header
  } catch {
    return null
  }
}

function isSameOriginOgRpc(rpcUrl: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const url = new URL(rpcUrl, window.location.origin)
    return url.origin === window.location.origin && url.pathname === '/api/og/rpc'
  } catch {
    return rpcUrl.startsWith('/api/og/rpc')
  }
}

/**
 * Create a static 0G JsonRpcProvider.
 *
 * Only same-origin /api/og/rpc needs x-medivault-auth. Official 0G RPC does not
 * need app auth, and asking the main wallet to sign auth during balance checks
 * caused popup storms. For direct RPC URLs, this returns a plain provider.
 */
export async function createAuthedProvider(
  signer: ethers.Signer | null,
  address: string | null,
  rpcUrl: string,
): Promise<ethers.JsonRpcProvider> {
  const network = new ethers.Network('0g-mainnet', 16661)

  if (!isSameOriginOgRpc(rpcUrl)) {
    return new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network })
  }

  const fetchReq = new ethers.FetchRequest(rpcUrl)
  const auth = await buildAuthHeader(signer, address)
  if (auth) fetchReq.setHeader('x-medivault-auth', auth)
  return new ethers.JsonRpcProvider(fetchReq, network, { staticNetwork: network })
}

export async function getAuthHeader(
  signer: ethers.Signer | null,
  address: string | null,
): Promise<string | null> {
  return buildAuthHeader(signer, address)
}
