import { ethers } from 'ethers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side auth for protected API routes.
 *
 * The browser signs a short, time-bound challenge with the wallet that owns the
 * protected resource. The signature is sent in `x-medivault-auth` as:
 *   `${address}|${timestamp}|${nonce}|${signature}`
 * where `signature = personal_sign("${address}|${timestamp}|${nonce}")`.
 *
 * Security model:
 * - The signed message binds the caller's address, a timestamp, and a random
 *   nonce (entropy so two headers are never identical).
 * - Replay is bounded by a tight 90-second timestamp window (MAX_SKEW_MS).
 * - Generic error messages avoid information leakage.
 * - Backward-compatible with legacy 3-part headers (address|timestamp|signature).
 *
 * NOTE: We intentionally do NOT enforce single-use nonces. The browser caches a
 * single signed header for ~70s (under MAX_SKEW_MS) and legitimately reuses it
 * across the multiple requests of one upload (e.g. /api/parse then
 * /api/ai/extract, plus 0G storage-node calls). Rejecting nonce reuse broke
 * those flows with false "Authentication failed." errors, so the short
 * timestamp window is the replay bound instead.
 */

const MAX_SKEW_MS = 90 * 1000 // 90 seconds
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

/** Verify an `address|timestamp|nonce|signature` auth header.
 *
 * Supports legacy 3-part headers (`address|timestamp|signature`) for backward
 * compatibility with older clients. New clients should use 4-part with nonce.
 */
export function verifyAuth(req: NextRequest | Request): AuthResult {
  const header = req.headers.get('x-medivault-auth')
  if (!header) return { ok: false, response: error(401, 'Authentication required.') }

  const parts = header.split('|')
  if (parts.length !== 4 && parts.length !== 3) {
    return { ok: false, response: error(401, 'Malformed auth header.') }
  }

  const [address, tsStr, part3, part4] = parts
  // For 4-part: nonce = part3, signature = part4
  // For 3-part (legacy): signature = part3, nonce = null
  const nonce = parts.length === 4 ? part3 : null
  const signature = parts.length === 4 ? part4 : part3

  if (!ethers.isAddress(address)) return { ok: false, response: error(401, 'Authentication failed.') }

  const ts = Number(tsStr)
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, response: error(401, 'Authentication failed.') }
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return { ok: false, response: error(401, 'Authentication failed.') }
  }

  try {
    // For nonce-based auth, the signed message includes the nonce.
    // For legacy auth, it's just address|timestamp.
    const signedMessage = nonce
      ? `${address}|${ts}|${nonce}`
      : `${address}|${ts}`
    const expected = ethers.verifyMessage(signedMessage, signature)
    if (expected.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, response: error(401, 'Authentication failed.') }
    }
  } catch {
    return { ok: false, response: error(401, 'Authentication failed.') }
  }

  return { ok: true, address: ethers.getAddress(address) }
}

export function requireAuthAddress(req: NextRequest | Request, address: string): AuthResult {
  const auth = verifyAuth(req)
  if (!auth.ok) return auth
  if (auth.address.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, response: error(403, 'Access denied.') }
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
