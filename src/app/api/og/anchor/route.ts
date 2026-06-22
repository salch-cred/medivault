import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress, verifyAuth } from '@/lib/server/auth'
import type { AnchorRecord } from '@/lib/og/anchor'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/
const TX_RE = /^0x[0-9a-fA-F]{64}$/
const MAX_ENTRIES = 100
const CHAIN_ID = 16661

function anchorKey(address: string): string {
  return `anchors_${address.toLowerCase()}`
}

async function getAnchors(address: string): Promise<AnchorRecord[]> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${anchorKey(address)}`)
    if (!res.ok) return []
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return []
    const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    if (!decoded) return []
    const parsed = JSON.parse(decoded)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Failed to retrieve anchors:', err)
    return []
  }
}

async function saveAnchors(address: string, entries: AnchorRecord[]): Promise<void> {
  const hex = Buffer.from(JSON.stringify(entries)).toString('hex')
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${anchorKey(address)}/${hex}`, { method: 'POST' })
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
    const entries = await getAnchors(address)
    return NextResponse.json(entries)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const { txHash, indexRoot } = body
    if (typeof txHash !== 'string' || !TX_RE.test(txHash)) {
      return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 })
    }
    if (typeof indexRoot !== 'string' || !ROOT_RE.test(indexRoot)) {
      return NextResponse.json({ error: 'Invalid index root hash' }, { status: 400 })
    }

    const actor = auth.address.toLowerCase()
    const entries = await getAnchors(actor)
    const record: AnchorRecord = {
      txHash: txHash.toLowerCase(),
      indexRoot: indexRoot.toLowerCase(),
      anchoredAt: new Date().toISOString(),
      chainId: CHAIN_ID,
    }
    const updated = [...entries, record].slice(-MAX_ENTRIES)
    await saveAnchors(actor, updated)

    return NextResponse.json({ success: true, record })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
