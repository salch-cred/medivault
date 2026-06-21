import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Instant share-envelope cache.
//
// Stores a small, client-side-ECIES-encrypted copy of a shared record's
// envelope (summary + the keys needed to fetch the original file from 0G),
// keyed by the 0G root hash, in the same persistent key-value service the rest
// of the app already uses. This lets a recipient open a shared link and decrypt
// it in ~1s on-device instead of waiting (sometimes minutes) for the small
// envelope to become locatable on 0G mainnet. The value is ciphertext only, so
// the KV service never sees any plaintext PHI.

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'

// Hard cap so we never build an absurd KV URL. Envelopes above this threshold
// are simply not cached here and the client transparently falls back to
// fetching the durable copy from 0G storage.
const MAX_VALUE_CHARS = 24000

function envKey(hash: string): string {
  return `shareenv_${hash.toLowerCase()}`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const hash = searchParams.get('hash')?.toLowerCase()
    if (!hash) {
      return NextResponse.json({ error: 'Missing hash parameter' }, { status: 400 })
    }
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${envKey(hash)}`)
    if (!res.ok) return NextResponse.json({})
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return NextResponse.json({})
    let decoded = ''
    try {
      decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    } catch {
      return NextResponse.json({})
    }
    if (!decoded) return NextResponse.json({})
    let parsed: unknown
    try {
      parsed = JSON.parse(decoded)
    } catch {
      return NextResponse.json({})
    }
    return NextResponse.json({ envelope: parsed })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { hash, envelope } = body
    if (!hash || !envelope) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    const hex = Buffer.from(JSON.stringify(envelope)).toString('hex')
    if (hex.length > MAX_VALUE_CHARS) {
      // Too large for the KV transport -- recipient will fall back to 0G.
      return NextResponse.json({ skipped: true, reason: 'too_large' })
    }
    await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${envKey(hash)}/${hex}`, { method: 'POST' })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
