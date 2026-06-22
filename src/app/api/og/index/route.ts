import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/

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
    const addressRaw = searchParams.get('address')
    if (!addressRaw || !ethers.isAddress(addressRaw)) {
      return NextResponse.json({ error: 'Missing or invalid address parameter' }, { status: 400 })
    }
    const address = ethers.getAddress(addressRaw).toLowerCase()
    const auth = requireAuthAddress(req, address)
    if (!auth.ok) return auth.response

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
    if (!address || !rootHash || !ethers.isAddress(address)) {
      return NextResponse.json({ error: 'Missing or invalid required parameters' }, { status: 400 })
    }
    if (!ROOT_RE.test(rootHash)) {
      return NextResponse.json({ error: 'Invalid root hash' }, { status: 400 })
    }
    const normalized = ethers.getAddress(address).toLowerCase()
    const auth = requireAuthAddress(req, normalized)
    if (!auth.ok) return auth.response

    await savePointer(normalized, {
      rootHash: rootHash.toLowerCase(),
      updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date().toISOString(),
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
