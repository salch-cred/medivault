'use client'

import type { ethers } from 'ethers'

/**
 * Browser helper that builds the `x-medivault-auth` header expected by the
 * server auth (src/lib/server/auth.ts). Signs `address|timestamp` with the
 * requested signer. The result is cached in sessionStorage for ~4 minutes so
 * protected API calls don't repeatedly prompt the user during one session.
 */

const AUTH_CACHE_PREFIX = 'medivault_auth_v1'
const AUTH_CACHE_TTL_MS = 4 * 60 * 1000

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

export async function buildAuthHeader(
  signer: ethers.Signer | null,
  address: string | null,
): Promise<string | null> {
  if (!signer || !address) return null
  const cached = readCached(address)
  if (cached) return cached

  const ts = Date.now()
  // Use | as delimiter to match server-side verifyAuth (see server/auth.ts).
  const message = `${address}|${ts}`
  try {
    const signature = await signer.signMessage(message)
    const header = `${address}|${ts}|${signature}`
    writeCached(address, header, ts)
    return header
  } catch {
    return null
  }
}
