'use client'

import { ethers } from 'ethers'

/**
 * Browser helper that builds the `x-medivault-auth` header expected by the
 * server auth (src/lib/server/auth.ts).
 *
 * Signs `address|timestamp|nonce` with the requested signer. The result is
 * cached in sessionStorage for ~70 seconds — safely under the server's 90s
 * skew window — so protected API calls don't repeatedly prompt the user during
 * one session while never sending an expired header.
 */

const AUTH_CACHE_PREFIX = 'medivault_auth_v1'
const AUTH_CACHE_TTL_MS = 70 * 1000 // 70s — under the server's 90s MAX_SKEW_MS

type CachedAuth = { header: string; ts: number }

function cacheKey(address: string): string {
  return `${AUTH_CACHE_PREFIX}:${address.toLowerCase()}`
}

function readCached(address: string): string | null {
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

/** Generate a random nonce string (16 hex chars = 8 bytes of entropy). */
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
  const cached = readCached(address)
  if (cached) return cached

  const ts = Date.now()
  const nonce = generateNonce()
  // Sign address|timestamp|nonce to match server-side verifyAuth 4-part format.
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

/**
 * Create an ethers.JsonRpcProvider that injects the `x-medivault-auth` header
 * into every JSON-RPC request via a custom FetchRequest override.
 *
 * This is needed because the /api/og/rpc proxy now requires auth (added in
 * security fixes), but ethers.JsonRpcProvider does not send custom headers
 * by default.
 *
 * The signer is used to build the auth header on-demand (with caching).
 * If signer or address is null, falls back to a plain provider (best effort).
 */
export async function createAuthedProvider(
  signer: ethers.Signer | null,
  address: string | null,
  rpcUrl: string,
): Promise<ethers.JsonRpcProvider> {
  if (!signer || !address) {
    // Best-effort fallback: try without auth (may 401, but won't crash).
    return new ethers.JsonRpcProvider(rpcUrl)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const originalFetch = provider.fetch.bind(provider)

  // Override fetch to inject auth header on every request.
  provider.fetch = async (req: ethers.FetchRequest | string): Promise<ethers.FetchResponse> => {
    const auth = await buildAuthHeader(signer, address)
    if (auth) {
      if (typeof req === 'string') {
        req = new ethers.FetchRequest(req)
      }
      req.setHeader('x-medivault-auth', auth)
    }
    return originalFetch(req)
  }

  return provider
}

/**
 * Get a fresh auth header (or cached one) as a string, for use in raw fetch()
 * calls to authed API routes. Returns null if signer or address is null.
 */
export async function getAuthHeader(
  signer: ethers.Signer | null,
  address: string | null,
): Promise<string | null> {
  return buildAuthHeader(signer, address)
}
