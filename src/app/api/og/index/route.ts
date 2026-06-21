import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Durable, cross-device record-index pointer store.
//
// MediVault has no public 0G-KV node on mainnet, so the per-user record index
// (the encrypted list of RecordMeta) is uploaded to 0G STORAGE and only a tiny
// pointer ({ rootHash }) is kept here, in the same persistent key-value service
// the sharing feature already uses. The pointer is small (~120 bytes) so it
// always fits well within the KV value/URL limits. The actual index bytes live
// on 0G (encrypted with the wallet-derived vault key), giving lifelong,
// device-independent persistence with zero central PHI database.

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'

function indexKey(address: string): string {
  return `mvidx_${address.toLowerCase()}`
}

async function getPointer(address: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${indexKey(address)}`)
    if (!res.ok) return null
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return null
    const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    if (!decoded) return null
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (err) {
    console.warn('Failed to read record-index pointer:', err)
    return null
  }
}

async function savePointer(address: string, pointer: Record<string, unknown>): Promise<void> {
  const hex = Buffer.from(JSON.stringify(pointer)).toString('hex')
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${indexKey(address)}/${hex}`, { method: 'POST' })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')?.toLowerCase()
    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 })
    }
    const pointer = await getPointer(address)
    return NextResponse.json(pointer || {})
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { address, rootHash, updatedAt } = body
    if (!address || !rootHash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    await savePointer(address, {
      rootHash,
      updatedAt: updatedAt || new Date().toISOString(),
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
