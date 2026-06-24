import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress, verifyAuth } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/
const MAX_TITLE = 160
const MAX_NAME = 80
const MAX_DOCTYPE = 64
// FIX: cap the `date` field length. Previously `typeof date === 'string'` with
// no length limit allowed an attacker to stuff a multi-KB string into the
// date slot, which grew the KV payload and appeared in the recipient's UI.
const MAX_DATE = 30 // ISO 8601 dates are at most 29 chars
// FIX: cap the total number of shares per recipient to prevent unbounded KV
// payload growth. Oldest entries are dropped when the cap is exceeded.
const MAX_SHARES = 500

function sharesKey(address: string): string {
  return `shares_${address.toLowerCase()}`
}

function cleanString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

async function getPersistentShares(address: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${KV_BASE}/GetValue/${KV_NS}/${sharesKey(address)}`)
    if (!res.ok) return []
    const raw = await res.text()
    const cleaned = raw.replace(/"/g, '').trim()
    if (!cleaned) return []
    const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
    if (!decoded) return []
    const parsed = JSON.parse(decoded)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Failed to retrieve persistent shares:', err)
    return []
  }
}

async function savePersistentShares(address: string, shares: unknown[]): Promise<void> {
  const hex = Buffer.from(JSON.stringify(shares)).toString('hex')
  await fetch(`${KV_BASE}/UpdateValue/${KV_NS}/${sharesKey(address)}/${hex}`, { method: 'POST' })
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

    const sharedRecords = await getPersistentShares(address)
    return NextResponse.json(sharedRecords)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const body = await req.json()
    const {
      recipientAddress,
      senderName,
      senderAddress,
      title,
      docType,
      date,
      sharedAt,
      rootHash,
    } = body

    if (!recipientAddress || !senderAddress || !rootHash || !title) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    if (!ethers.isAddress(recipientAddress) || !ethers.isAddress(senderAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }
    if (auth.address.toLowerCase() !== senderAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Authenticated wallet does not match senderAddress' }, { status: 403 })
    }
    if (!ROOT_RE.test(rootHash)) {
      return NextResponse.json({ error: 'Invalid root hash' }, { status: 400 })
    }

    const recipientAddrLower = ethers.getAddress(recipientAddress).toLowerCase()
    const newEntry = {
      id: `${recipientAddrLower}_${Date.now()}`,
      recipientAddress: recipientAddrLower,
      senderName: cleanString(senderName, MAX_NAME),
      senderAddress: ethers.getAddress(senderAddress).toLowerCase(),
      title: cleanString(title, MAX_TITLE),
      docType: cleanString(docType, MAX_DOCTYPE),
      // FIX: cap date string length to prevent multi-KB date injections.
      date: typeof date === 'string' ? date.slice(0, MAX_DATE) : null,
      sharedAt: typeof sharedAt === 'string' ? sharedAt : new Date().toISOString(),
      rootHash: rootHash.toLowerCase(),
    }

    const existingShares = await getPersistentShares(recipientAddrLower)
    // FIX: cap total list size at MAX_SHARES; drop oldest entries when exceeded.
    const deduped = (existingShares as { rootHash?: string }[]).filter(
      (s) => s.rootHash !== newEntry.rootHash,
    )
    const updatedShares = [...deduped, newEntry].slice(-MAX_SHARES)
    await savePersistentShares(recipientAddrLower, updatedShares)

    return NextResponse.json({ success: true, record: newEntry })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
