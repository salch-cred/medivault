import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Determine writable directory based on environment (Vercel has a writable /tmp)
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
const WritableDir = isVercel ? '/tmp' : path.join(process.cwd(), 'scratch')
const REGISTRY_FILE = path.join(WritableDir, 'shared_records.json')

// Global in-memory cache to ensure registry data is preserved across container runs
const globalForShares = global as unknown as {
  sharesMemory: any[]
}
if (!globalForShares.sharesMemory) {
  globalForShares.sharesMemory = []
}

// Helper to read the registry
function readRegistry(): any[] {
  try {
    let fileShares: any[] = []
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = fs.readFileSync(REGISTRY_FILE, 'utf8')
      fileShares = JSON.parse(data)
    }
    // Merge array unique by id
    const merged = [...fileShares]
    for (const memShare of globalForShares.sharesMemory) {
      if (!merged.some(x => x.id === memShare.id)) {
        merged.push(memShare)
      }
    }
    globalForShares.sharesMemory = merged
    return globalForShares.sharesMemory
  } catch (e) {
    console.error('Error reading shared records registry:', e)
    return globalForShares.sharesMemory || []
  }
}

// Helper to write to the registry
function writeRegistry(data: any[]) {
  try {
    globalForShares.sharesMemory = data
    // Write to writable dir, wrap in try-catch so it never crashes the handler if it fails
    fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error writing shared records registry:', e)
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')?.toLowerCase()

    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 })
    }

    const registry = readRegistry()
    // Filter records shared WITH this address
    const sharedRecords = registry.filter(
      (r: any) => r.recipientAddress?.toLowerCase() === address
    )

    return NextResponse.json(sharedRecords)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
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

    const registry = readRegistry()
    const newEntry = {
      id: `${recipientAddress.toLowerCase()}_${Date.now()}`,
      recipientAddress: recipientAddress.toLowerCase(),
      senderName,
      senderAddress: senderAddress.toLowerCase(),
      title,
      docType,
      date,
      sharedAt,
      rootHash,
    }

    registry.push(newEntry)
    writeRegistry(registry)

    return NextResponse.json({ success: true, record: newEntry })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
