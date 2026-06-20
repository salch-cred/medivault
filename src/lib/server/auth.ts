import { ethers } from 'ethers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side auth for the AI/parse API routes.
 *
 * The browser signs a short, time-bound challenge with the connected wallet.
 * The signature is sent in the `x-medivault-auth` header as:
 *   `${address}.${timestamp}.${signature}`
 * where `signature = personal_sign("${address}.${timestamp}")`.
 *
 * This is intentionally lightweight (no SIWE library) and proves the caller
 * controls a wallet — enough to stop drive-by abuse of the LLM proxy while
 * keeping the dependency surface small.
 */

const MAX_SKEW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_TEXT = 60_000 // chars of document text we'll process
const MAX_RECORDS = 50 // records passed into chat context
const MAX_QUESTION = 4_000 // chat question length

export type AuthResult =
  | { ok: true; address: string }
  | { ok: false; response: NextResponse }

function error(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Verify a `address.timestamp.signature` auth header. */
export function verifyAuth(req: NextRequest): AuthResult {
  const header = req.headers.get('x-medivault-auth')
  if (!header) {
    return { ok: false, response: error(401, 'Authentication required.') }
  }
  const parts = header.split('.')
  if (parts.length !== 3) {
    return { ok: false, response: error(401, 'Malformed auth header.') }
  }
  const [address, tsStr, signature] = parts

  // Validate address first — ethers.isAddress throws on garbage.
  if (!ethers.isAddress(address)) {
    return { ok: false, response: error(401, 'Invalid wallet address.') }
  }

  const ts = Number(tsStr)
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, response: error(401, 'Invalid timestamp.') }
  }
  const skew = Math.abs(Date.now() - ts)
  if (skew > MAX_SKEW_MS) {
    return { ok: false, response: error(401, 'Auth timestamp out of range.') }
  }

  // Recover the signer from the personal-signature of "address.timestamp".
  // personal_sign prefixes the message; ethers.verifyMessage replicates that.
  const expected = ethers.verifyMessage(`${address}.${ts}`, signature)
  if (expected.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, response: error(401, 'Signature verification failed.') }
  }
  return { ok: true, address }
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
