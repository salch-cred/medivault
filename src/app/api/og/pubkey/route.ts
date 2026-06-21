import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuthAddress } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal'
const KV_NS = 'p0vd5ml2'

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
    const { searchParams } = new URL(req.url)
    const addressRaw = searchParams.get('address')
    if (!addressRaw || !ethers.isAddress(addressRaw)) {
      return NextResponse.json({ error: 'Missing or invalid address parameter' }, { status: 400 })
    }
    const address = ethers.getAddress(addressRaw).toLowerCase()
    const pubKey = await readPubKey(address)
    if (!pubKey) {
      return NextResponse.json({ error: 'Public key not found. Please ask the recipient to open MediVault and connect their wallet once.' }, { status: 404 })
    }
    return NextResponse.json({ publicKey: pubKey })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
