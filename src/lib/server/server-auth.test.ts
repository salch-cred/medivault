/**
 * Tests for src/lib/server/auth.ts
 *
 * We test verifyAuth logic by constructing minimal Request objects with the
 * appropriate `x-medivault-auth` headers, using real ethers.js wallet signing
 * so the ECDSA recovery paths are exercised with real cryptography.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ethers } from 'ethers'
import { verifyAuth, requireAuthAddress, checkRateLimit, clamp, LIMITS } from './auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(header: string | null, url = 'http://localhost/api/test'): Request {
  const headers = new Headers()
  if (header !== null) headers.set('x-medivault-auth', header)
  return new Request(url, { headers })
}

async function signHeader(
  wallet: ethers.Wallet,
  overrideTs?: number,
  overrideAddress?: string,
): Promise<string> {
  const address = overrideAddress ?? wallet.address
  const ts = overrideTs ?? Date.now()
  const nonce = 'testnonce'
  const message = `${address}|${ts}|${nonce}`
  const sig = await wallet.signMessage(message)
  return `${address}|${ts}|${nonce}|${sig}`
}

// ---------------------------------------------------------------------------
// verifyAuth
// ---------------------------------------------------------------------------

describe('verifyAuth', () => {
  it('returns ok=false with 401 when no header is present', () => {
    const req = makeRequest(null)
    const result = verifyAuth(req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns ok=false for a completely malformed header (too few parts)', () => {
    const req = makeRequest('only_one_part')
    const result = verifyAuth(req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns ok=false for a header with 5 parts (too many)', () => {
    const req = makeRequest('a|b|c|d|e')
    const result = verifyAuth(req)
    expect(result.ok).toBe(false)
  })

  it('returns ok=false for an invalid Ethereum address', async () => {
    const wallet = ethers.Wallet.createRandom()
    const ts = Date.now()
    const sig = await wallet.signMessage(`notanaddress|${ts}|nonce`)
    const req = makeRequest(`notanaddress|${ts}|nonce|${sig}`)
    const result = verifyAuth(req)
    expect(result.ok).toBe(false)
  })

  it('returns ok=false for an expired timestamp (> 90s ago)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const oldTs = Date.now() - 95_000 // 95 seconds ago
    const header = await signHeader(wallet, oldTs)
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns ok=false for a future timestamp (> 90s ahead)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const futureTs = Date.now() + 95_000
    const header = await signHeader(wallet, futureTs)
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(false)
  })

  it('returns ok=true for a valid 4-part header within the time window', async () => {
    const wallet = ethers.Wallet.createRandom()
    const header = await signHeader(wallet)
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.address.toLowerCase()).toBe(wallet.address.toLowerCase())
  })

  it('accepts a timestamp at the exact boundary (89s ago)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const boundaryTs = Date.now() - 89_000
    const header = await signHeader(wallet, boundaryTs)
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when signature is from a different wallet (wrong signer)', async () => {
    const wallet1 = ethers.Wallet.createRandom()
    const wallet2 = ethers.Wallet.createRandom()
    const ts = Date.now()
    const nonce = 'nonce'
    // Sign with wallet2 but claim to be wallet1
    const sig = await wallet2.signMessage(`${wallet1.address}|${ts}|${nonce}`)
    const header = `${wallet1.address}|${ts}|${nonce}|${sig}`
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(false)
  })

  it('returns ok=false for a tampered message (different address in sig vs header)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const ts = Date.now()
    // Sign the correct message but modify the header address after signing
    const sig = await wallet.signMessage(`${wallet.address}|${ts}|nonce`)
    const fakeAddress = ethers.Wallet.createRandom().address
    const header = `${fakeAddress}|${ts}|nonce|${sig}`
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(false)
  })

  it('accepts the legacy 3-part header format (address|ts|sig)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const ts = Date.now()
    const sig = await wallet.signMessage(`${wallet.address}|${ts}`)
    const header = `${wallet.address}|${ts}|${sig}`
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(true)
  })

  it('returns ok=false for non-numeric timestamp', async () => {
    const wallet = ethers.Wallet.createRandom()
    const sig = await wallet.signMessage(`${wallet.address}|not-a-number|nonce`)
    const header = `${wallet.address}|not-a-number|nonce|${sig}`
    const result = verifyAuth(makeRequest(header))
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// requireAuthAddress
// ---------------------------------------------------------------------------

describe('requireAuthAddress', () => {
  it('returns ok=true when address matches the authenticated address', async () => {
    const wallet = ethers.Wallet.createRandom()
    const header = await signHeader(wallet)
    const result = requireAuthAddress(makeRequest(header), wallet.address)
    expect(result.ok).toBe(true)
  })

  it('returns 403 when address does not match the authenticated address', async () => {
    const wallet = ethers.Wallet.createRandom()
    const other = ethers.Wallet.createRandom()
    const header = await signHeader(wallet)
    const result = requireAuthAddress(makeRequest(header), other.address)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('is case-insensitive for address comparison', async () => {
    const wallet = ethers.Wallet.createRandom()
    const header = await signHeader(wallet)
    // Pass the lowercase version — should still match
    const result = requireAuthAddress(makeRequest(header), wallet.address.toLowerCase())
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Reset by using unique addresses each test to avoid inter-test pollution.
    // (The module-level Map persists across tests in the same process.)
  })

  it('allows requests up to the limit', () => {
    const addr = ethers.Wallet.createRandom().address
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(addr, 'test-action', 5)).toBe(true)
    }
  })

  it('blocks the request after the limit is exceeded', () => {
    const addr = ethers.Wallet.createRandom().address
    for (let i = 0; i < 5; i++) checkRateLimit(addr, 'test-block', 5)
    expect(checkRateLimit(addr, 'test-block', 5)).toBe(false)
  })

  it('allows requests from different addresses independently', () => {
    const addr1 = ethers.Wallet.createRandom().address
    const addr2 = ethers.Wallet.createRandom().address
    for (let i = 0; i < 5; i++) checkRateLimit(addr1, 'chat', 5)
    // addr2 should still be allowed
    expect(checkRateLimit(addr2, 'chat', 5)).toBe(true)
  })

  it('treats different actions for the same address independently', () => {
    const addr = ethers.Wallet.createRandom().address
    for (let i = 0; i < 5; i++) checkRateLimit(addr, 'extract', 5)
    // A different action for the same address should still be allowed
    expect(checkRateLimit(addr, 'chat', 5)).toBe(true)
  })

  it('resets count after the window expires', async () => {
    // We can't easily wait 60s in a test, but we can mock Date.now()
    const addr = ethers.Wallet.createRandom().address
    let fakeNow = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)

    for (let i = 0; i < 3; i++) checkRateLimit(addr, 'reset-test', 3)
    expect(checkRateLimit(addr, 'reset-test', 3)).toBe(false)

    // Advance time past the window
    fakeNow += 61_000
    expect(checkRateLimit(addr, 'reset-test', 3)).toBe(true)

    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('returns empty string for undefined and null', () => {
    expect(clamp(undefined, 100)).toBe('')
    expect(clamp('', 100)).toBe('')
  })

  it('returns original string when within limit', () => {
    expect(clamp('hello', 10)).toBe('hello')
    expect(clamp('hello', 5)).toBe('hello')
  })

  it('truncates to max chars', () => {
    expect(clamp('abcdefgh', 4)).toBe('abcd')
    expect(clamp('a'.repeat(1000), LIMITS.MAX_TEXT)).toHaveLength(LIMITS.MAX_TEXT)
  })
})
