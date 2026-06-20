'use client'

import type { ethers } from 'ethers'

/**
 * Browser helper that builds the `x-medivault-auth` header expected by the
 * server auth (src/lib/server/auth.ts). Signs `address.timestamp` with the
 * connected wallet via personal_sign. Returns the header value or null if the
 * user declines / no signer is available.
 */
export async function buildAuthHeader(
  signer: ethers.Signer | null,
  address: string | null,
): Promise<string | null> {
  if (!signer || !address) return null
  const ts = Date.now()
  const message = `${address}.${ts}`
  try {
    const signature = await signer.signMessage(message)
    return `${address}.${ts}.${signature}`
  } catch {
    return null
  }
}
