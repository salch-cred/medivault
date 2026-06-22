import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress, verifyAuth } from '@/lib/server/auth'
import {
  GENESIS_HASH,
  computeEntryHash,
  type ConsentEvent,
  type ConsentEventCore,
  type ConsentEventType,
} from '@/lib/og/ledger'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/
const MAX_TITLE = 160
const MAX_ENTRIES = 200

function ledgerKey(address: string): string {
  return `ledger_${address.toLowerCase()}`
}

function cleanString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

async function getLedger(address: string): Promise<ConsentEvent[]> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${ledgerKey(address)}`)
    if (!res.ok) return []
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return []
    const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    if (!decoded) return []
    const parsed = JSON.parse(decoded)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Failed to retrieve consent ledger:', err)
    return []
  }
}

async function saveLedger(address: string, entries: ConsentEvent[]): Promise<void> {
  const hex = Buffer.from(JSON.stringify(entries)).toString('hex')
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${ledgerKey(address)}/${hex}`, { method: 'POST' })
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

    const entries = await getLedger(address)
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
    const { type, recipientAddress, recordTitle, recordRootHash } = body

    const evType: ConsentEventType = type === 'revoke' ? 'revoke' : 'grant'
    if (!recipientAddress || !ethers.isAddress(recipientAddress)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
    }
    if (typeof recordRootHash !== 'string' || !ROOT_RE.test(recordRootHash)) {
      return NextResponse.json({ error: 'Invalid record root hash' }, { status: 400 })
    }

    const actor = auth.address.toLowerCase()
    const recipient = ethers.getAddress(recipientAddress).toLowerCase()

    const entries = await getLedger(actor)
    const prevHash = entries.length ? entries[entries.length - 1].entryHash : GENESIS_HASH

    const core: ConsentEventCore = {
      id: `${actor}_${Date.now()}`,
      ts: new Date().toISOString(),
      type: evType,
      actor,
      recipient,
      recordTitle: cleanString(recordTitle, MAX_TITLE),
      recordRootHash: recordRootHash.toLowerCase(),
      prevHash,
    }
    const entry: ConsentEvent = { ...core, entryHash: computeEntryHash(core) }

    const updated = [...entries, entry].slice(-MAX_ENTRIES)
    await saveLedger(actor, updated)

    return NextResponse.json({ success: true, entry })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
