import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Determine writable directory based on environment (Vercel has a writable /tmp)
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
const WritableDir = isVercel ? '/tmp' : path.join(process.cwd(), 'scratch')
const PUBKEYS_FILE = path.join(WritableDir, 'public_keys.json')

// Global in-memory cache to ensure registry data is preserved across container runs
const globalForKeys = global as unknown as {
  pubkeysMemory: Record<string, string>
}
if (!globalForKeys.pubkeysMemory) {
  globalForKeys.pubkeysMemory = {}
}

function readKeys(): Record<string, string> {
  try {
    // Merge memory cache with file system cache
    let fileKeys: Record<string, string> = {}
    if (fs.existsSync(PUBKEYS_FILE)) {
      const data = fs.readFileSync(PUBKEYS_FILE, 'utf8')
      fileKeys = JSON.parse(data)
    }
    // Update global cache with file contents and vice versa
    globalForKeys.pubkeysMemory = {
      ...fileKeys,
      ...globalForKeys.pubkeysMemory
    }
    return globalForKeys.pubkeysMemory
  } catch (e) {
    console.error('Error reading pubkeys registry:', e)
    return globalForKeys.pubkeysMemory || {}
  }
}

function writeKeys(data: Record<string, string>) {
  try {
    globalForKeys.pubkeysMemory = data
    // Write to writable dir, wrap in try-catch so it never crashes the handler if it fails
    fs.mkdirSync(path.dirname(PUBKEYS_FILE), { recursive: true })
    fs.writeFileSync(PUBKEYS_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error writing pubkeys registry:', e)
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')?.toLowerCase()

    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 })
    }

    const keys = readKeys()
    const pubKey = keys[address]

    if (!pubKey) {
      return NextResponse.json({ error: 'Public key not registered for this address' }, { status: 404 })
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

    if (!address || !publicKey) {
      return NextResponse.json({ error: 'Missing address or publicKey parameter' }, { status: 400 })
    }

    const keys = readKeys()
    keys[address.toLowerCase()] = publicKey
    writeKeys(keys)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
