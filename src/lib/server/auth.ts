import { ethers } from 'ethers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side auth for protected API routes.
 *
 * The browser signs a short, time-bound challenge with the wallet that owns the
 * protected resource. The signature is sent in `x-medivault-auth` as:
 *   `${address}|${timestamp}|${signature}`
 * where `signature = personal_sign("${address}|${timestamp}")`.
 */

const MAX_SKEW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_TEXT = 60_000 // chars of document text we'll process
const MAX_RECORDS = 50 // records passed into chat context
const MAX_QUESTION = 4_000 // chat question length

// Rate limiting: per-address, per-action, in-memory (sufficient for a single
// Vercel serverless instance; for multi-instance you'd use Redis or Upstash).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute

export function checkRateLimit(
  address: string,
  action: string,
  maxPerMinute: number,
): boolean {
  const key = `${address.toLowerCase()}:${action}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= maxPerMinute) return false
  entry.count++
  return true
}

export type AuthResult =
  | { ok: true; address: string }
  | { ok: false; response: NextResponse }

function error(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Verify an `address|timestamp|signature` auth header. */
export function verifyAuth(req: NextRequest | Request): AuthResult {
  const header = req.headers.get('x-medivault-auth')
  if (!header) return { ok: false, response: error(401, 'Authentication required.') }

  const parts = header.split('|')
  if (parts.length !== 3) return { ok: false, response: error(401, 'Malformed auth header.') }
  const [address, tsStr, signature] = parts

  if (!ethers.isAddress(address)) return { ok: false, response: error(401, 'Invalid wallet address.') }

  const ts = Number(tsStr)
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, response: error(401, 'Invalid timestamp.') }
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return { ok: false, response: error(401, 'Auth timestamp out of range.') }
  }

  try {
    const expected = ethers.verifyMessage(`${address}|${ts}`, signature)
    if (expected.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, response: error(401, 'Signature verification failed.') }
    }
  } catch {
    return { ok: false, response: error(401, 'Signature verification failed.') }
  }

  return { ok: true, address: ethers.getAddress(address) }
}

export function requireAuthAddress(req: NextRequest | Request, address: string): AuthResult {
  const auth = verifyAuth(req)
  if (!auth.ok) return auth
  if (auth.address.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, response: error(403, 'Authenticated wallet does not match requested address.') }
  }
  return auth
}

/** Bound a string to a max length (truncates overlong input). */
export function clamp(text: string | undefined, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) : text
}

export const LIMITS = {
  MAX_TEXT,
  MAX_RECORDS,
  MAX_QUESTION,
} as const
