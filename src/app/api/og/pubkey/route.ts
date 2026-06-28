import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress, verifyAuth } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'

// ---------------------------------------------------------------------------
// Hybrid rate limiter for pubkey GET: max 30 lookups per IP per minute.
//
// L1 - in-process Map: zero-latency fast path, reset on cold start.
// L2 - KV store: persists bucket state across instances and cold starts.
//      Only consulted on first request after a cold start (L1 miss), so the
//      extra round-trip is paid at most once per warm-up, not per request.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30

type RateBucket = { count: number; windowStart: number }
const l1Cache = new Map<string, RateBucket>()

function rlKey(ip: string): string {
  return `rl_pk_${ip.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

async function readBucket(ip: string): Promise<RateBucket | null> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${rlKey(ip)}`)
    if (!res.ok) return null
    const raw = (await res.text()).replace(/"/g, '').trim()
    if (!raw) return null
    return JSON.parse(Buffer.from(raw, 'hex').toString('utf8')) as RateBucket
  } catch {
    return null
  }
}

async function writeBucket(ip: string, bucket: RateBucket): Promise<void> {
  try {
    const hex = Buffer.from(JSON.stringify(bucket)).toString('hex')
    await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${rlKey(ip)}/${hex}`, { method: 'POST' })
  } catch {
    // Best-effort: never block the main request path.
  }
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const now = Date.now()

  // L1 fast path (warm instance).
  const cached = l1Cache.get(ip)
  if (cached) {
    if (now - cached.windowStart > RATE_WINDOW_MS) {
      const fresh: RateBucket = { count: 1, windowStart: now }
      l1Cache.set(ip, fresh)
      void writeBucket(ip, fresh)
      return true
    }
    if (cached.count >= RATE_MAX) return false
    cached.count++
    void writeBucket(ip, cached)
    return true
  }

  // L2 cold-start path: load persisted bucket from KV.
  const kv = await readBucket(ip)
  if (kv && now - kv.windowStart <= RATE_WINDOW_MS) {
    if (kv.count >= RATE_MAX) {
      l1Cache.set(ip, kv)
      return false
    }
    kv.count++
    l1Cache.set(ip, kv)
    void writeBucket(ip, kv)
    return true
  }

  // No entry or expired window: fresh bucket.
  const fresh: RateBucket = { count: 1, windowStart: now }
  l1Cache.set(ip, fresh)
  void writeBucket(ip, fresh)
  return true
}

// Evict stale L1 entries periodically.
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS
  for (const [ip, b] of l1Cache) {
    if (b.windowStart < cutoff) l1Cache.delete(ip)
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
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    // Hybrid rate limit: L1 in-process (warm) + L2 KV-backed (cold start).
    const ip =
      (req.headers as Headers).get('x-forwarded-for')?.split(',')[0].trim() ??
      (req.headers as Headers).get('x-real-ip') ??
      'unknown'
    const allowed = await checkRateLimit(ip)
    if (!allowed) {
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
