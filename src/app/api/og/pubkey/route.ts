import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress, verifyAuth } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'

// ---------------------------------------------------------------------------
// In-process rate limiter for pubkey GET: max 30 lookups per IP per minute.
// This prevents authenticated users from bulk-enumerating all registered keys.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30

type RateBucket = { count: number; windowStart: number }
const rateBuckets = new Map<string, RateBucket>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (bucket.count >= RATE_MAX) return false
  bucket.count++
  return true
}

// Evict stale buckets periodically to avoid unbounded Map growth.
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS
  for (const [ip, b] of rateBuckets) {
    if (b.windowStart < cutoff) rateBuckets.delete(ip)
  }
}, RATE_WINDOW_MS)

// ---------------------------------------------------------------------------

function pubkeyKey(address: string): string {
  return `pubkey_${address.toLowerCase()}`
}

function isValidPublicKey(publicKey: string): boolean {
  try {
    ethers.SigningKey.computePublicKey(publicKey, true)
    return true
  } catch {
    return false
  }
}

async function readPubKey(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${pubkeyKey(address)}`)
    if (!res.ok) return null
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return null
    const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    return decoded && isValidPublicKey(decoded) ? decoded : null
  } catch (err) {
    console.warn('Persistent public-key lookup failed:', err)
    return null
  }
}

async function writePubKey(address: string, publicKey: string): Promise<void> {
  const hex = Buffer.from(publicKey).toString('hex')
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${pubkeyKey(address)}/${hex}`, { method: 'POST' })
}

export async function GET(req: Request) {
  try {
    // Require authentication to prevent public key oracle attacks.
    // Only authenticated users can look up another user's public key.
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    // Rate-limit per originating IP to prevent bulk enumeration.
    const ip =
      (req.headers as Headers).get('x-forwarded-for')?.split(',')[0].trim() ??
      (req.headers as Headers).get('x-real-ip') ??
      'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before looking up another key.' },
        { status: 429 },
      )
    }

    const { searchParams } = new URL(req.url)
    const addressRaw = searchParams.get('address')
    if (!addressRaw || !ethers.isAddress(addressRaw)) {
      return NextResponse.json({ error: 'Missing or invalid address parameter' }, { status: 400 })
    }
    const address = ethers.getAddress(addressRaw).toLowerCase()
    const pubKey = await readPubKey(address)
    if (!pubKey) {
      return NextResponse.json({ error: 'Public key not found.' }, { status: 404 })
    }
    return NextResponse.json({ publicKey: pubKey })
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { address, publicKey } = body
    if (!address || !publicKey || !ethers.isAddress(address)) {
      return NextResponse.json({ error: 'Missing or invalid address/publicKey parameter' }, { status: 400 })
    }
    if (!isValidPublicKey(publicKey)) {
      return NextResponse.json({ error: 'Invalid public key' }, { status: 400 })
    }

    const addrLower = ethers.getAddress(address).toLowerCase()
    const auth = requireAuthAddress(req, addrLower)
    if (!auth.ok) return auth.response

    await writePubKey(addrLower, ethers.SigningKey.computePublicKey(publicKey, true))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
