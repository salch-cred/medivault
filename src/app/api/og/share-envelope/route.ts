import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Instant share-envelope cache. Stores client-side-ECIES ciphertext only, so
// the server never sees plaintext.
//
// The envelope is hex-encoded and written to a free KV store whose values are
// passed in the request URL, so a single value must stay comfortably small.
// Records with a large AI summary used to exceed that budget and were silently
// dropped (the share then appeared to succeed but the recipient got nothing).
// To make delivery reliable we split big envelopes into fixed-size chunks: the
// primary key holds a tiny JSON manifest ({ __chunks: n }) and each chunk lives
// at `<key>_<i>`. GET transparently reassembles either shape and still
// understands the older single-value format for back-compat.
//
// Chunk reads and writes are parallelised with Promise.all to cut round-trip
// latency from O(n) sequential fetches to O(1).

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/
// Conservative per-value hex budget (well within what the KV URL accepts).
const CHUNK_CHARS = 16000
// Hard ceiling on total envelope size to avoid pathological writes (~128 KB).
const MAX_CHUNKS = 8

function envKey(hash: string): string {
  return `shareenv_${hash.toLowerCase()}`
}

async function kvGet(key: string): Promise<string> {
  const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${key}`)
  if (!res.ok) return ''
  const raw = await res.text()
  return raw.replace(/"/g, '').trim()
}

async function kvPut(key: string, value: string): Promise<void> {
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${key}/${value}`, { method: 'POST' })
}

function decodeHexToJson(hex: string): unknown | null {
  if (!hex) return null
  let decoded = ''
  try {
    decoded = Buffer.from(hex, 'hex').toString('utf8')
  } catch {
    return null
  }
  if (!decoded) return null
  try {
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  try {
    // Require authentication to prevent metadata leakage.
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const hash = searchParams.get('hash')?.toLowerCase()
    if (!hash || !ROOT_RE.test(hash)) {
      return NextResponse.json({ error: 'Missing or invalid hash parameter' }, { status: 400 })
    }

    const primary = await kvGet(envKey(hash))
    const parsedPrimary = decodeHexToJson(primary)

    // Chunked manifest: fetch all chunks in parallel, then reassemble in order.
    if (
      parsedPrimary &&
      typeof parsedPrimary === 'object' &&
      typeof (parsedPrimary as { __chunks?: unknown }).__chunks === 'number'
    ) {
      const n = (parsedPrimary as { __chunks: number }).__chunks
      if (!Number.isInteger(n) || n < 1 || n > MAX_CHUNKS) return NextResponse.json({})

      const parts = await Promise.all(
        Array.from({ length: n }, (_, i) => kvGet(`${envKey(hash)}_${i}`)),
      )
      if (parts.some((p) => !p)) return NextResponse.json({})
      const hex = parts.join('')
      const envelope = decodeHexToJson(hex)
      if (!envelope || typeof envelope !== 'object') return NextResponse.json({})
      return NextResponse.json({ envelope })
    }

    // Legacy single-value format: the primary value IS the envelope.
    if (parsedPrimary && typeof parsedPrimary === 'object') {
      return NextResponse.json({ envelope: parsedPrimary })
    }

    return NextResponse.json({})
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const { hash, envelope } = body
    if (!hash || !ROOT_RE.test(hash) || !envelope || typeof envelope !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid required parameters' }, { status: 400 })
    }

    const hex = Buffer.from(JSON.stringify(envelope)).toString('hex')

    // Small enough to fit in a single value: store directly (legacy-compatible).
    if (hex.length <= CHUNK_CHARS) {
      await kvPut(envKey(hash), hex)
      return NextResponse.json({ success: true })
    }

    // Too big for one value: split into fixed-size chunks.
    const chunks: string[] = []
    for (let i = 0; i < hex.length; i += CHUNK_CHARS) {
      chunks.push(hex.slice(i, i + CHUNK_CHARS))
    }
    if (chunks.length > MAX_CHUNKS) {
      return NextResponse.json({ skipped: true, reason: 'too_large' })
    }

    // Write all chunks in parallel, then write the manifest LAST so a reader
    // never observes a partial chunk set.
    await Promise.all(chunks.map((chunk, i) => kvPut(`${envKey(hash)}_${i}`, chunk)))
    const manifestHex = Buffer.from(JSON.stringify({ __chunks: chunks.length })).toString('hex')
    await kvPut(envKey(hash), manifestHex)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
