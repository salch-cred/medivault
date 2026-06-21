import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

// Instant share-envelope cache. Stores client-side-ECIES ciphertext only.

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const MAX_VALUE_CHARS = 24000
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/

function envKey(hash: string): string {
  return `shareenv_${hash.toLowerCase()}`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const hash = searchParams.get('hash')?.toLowerCase()
    if (!hash || !ROOT_RE.test(hash)) {
      return NextResponse.json({ error: 'Missing or invalid hash parameter' }, { status: 400 })
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
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const { hash, envelope } = body
    if (!hash || !ROOT_RE.test(hash) || !envelope || typeof envelope !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid required parameters' }, { status: 400 })
    }
    const hex = Buffer.from(JSON.stringify(envelope)).toString('hex')
    if (hex.length > MAX_VALUE_CHARS) {
      return NextResponse.json({ skipped: true, reason: 'too_large' })
    }
    await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${envKey(hash)}/${hex}`, { method: 'POST' })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
