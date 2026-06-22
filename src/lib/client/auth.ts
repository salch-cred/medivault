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

const AUTH_CACHE_PREFIX = 'medivault_auth_v1'
const AUTH_CACHE_TTL_MS = 70 * 1000 // 70s — under the server's 90s MAX_SKEW_MS

type CachedAuth = { header: string; ts: number }

function cacheKey(address: string): string {
  return `${AUTH_CACHE_PREFIX}:${address.toLowerCase()}`
}

export function getCachedAuthHeader(address: string | null): string | null {
  if (!address) return null
  try {
    const raw = sessionStorage.getItem(cacheKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedAuth
    if (!parsed?.header || !parsed?.ts) return null
    if (Date.now() - parsed.ts > AUTH_CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(address))
      return null
    }
    return parsed.header
  } catch {
    return null
  }
}

function writeCached(address: string, header: string, ts: number): void {
  try {
    sessionStorage.setItem(cacheKey(address), JSON.stringify({ header, ts }))
  } catch {}
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
