import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
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

// Helper to read the local file registry (legacy local fallback)
function readLocalRegistry(): any[] {
  try {
    let fileShares: any[] = []
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = fs.readFileSync(REGISTRY_FILE, 'utf8')
      fileShares = JSON.parse(data)
    }
    const merged = [...fileShares]
    for (const memShare of globalForShares.sharesMemory) {
      if (!merged.some(x => x.id === memShare.id)) {
        merged.push(memShare)
      }
    }
    globalForShares.sharesMemory = merged
    return globalForShares.sharesMemory
  } catch (e) {
    console.error('Error reading local shared records registry:', e)
    return globalForShares.sharesMemory || []
  }
}

// Helper to write to local file registry (legacy local fallback)
function writeLocalRegistry(data: any[]) {
  try {
    globalForShares.sharesMemory = data
    fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error writing local shared records registry:', e)
  }
}

// Fetch shared records from persistent database
async function getPersistentShares(address: string): Promise<any[]> {
  try {
    const key = `shares_${address.toLowerCase()}`
    const res = await fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/p0vd5ml2/${key}`)
    if (res.ok) {
      const raw = await res.text()
      const cleaned = raw.replace(/"/g, '').trim()
      if (cleaned) {
        const decoded = Buffer.from(cleaned, 'hex').toString('utf8')
        if (decoded) {
          const parsed = JSON.parse(decoded)
          if (Array.isArray(parsed)) return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to retrieve persistent shares:', err)
  }
  return []
}

// Save shared records to persistent database
async function savePersistentShares(address: string, shares: any[]): Promise<void> {
  try {
    const key = `shares_${address.toLowerCase()}`
    const hex = Buffer.from(JSON.stringify(shares)).toString('hex')
    await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/p0vd5ml2/${key}/${hex}`, { method: 'POST' })
  } catch (err) {
    console.warn('Failed to save persistent shares:', err)
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')?.toLowerCase()

    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 })
    }

    // Try persistent database first
    let sharedRecords = await getPersistentShares(address)

    // Fallback to local memory/file registry if persistent DB is empty/fails
    if (sharedRecords.length === 0) {
      const localRegistry = readLocalRegistry()
      sharedRecords = localRegistry.filter(
        (r: any) => r.recipientAddress?.toLowerCase() === address
      )
      // Sync back to persistent DB if local records found
      if (sharedRecords.length > 0) {
        await savePersistentShares(address, sharedRecords)
      }
    }

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

    const recipientAddrLower = recipientAddress.toLowerCase()
    const newEntry = {
      id: `${recipientAddrLower}_${Date.now()}`,
      recipientAddress: recipientAddrLower,
      senderName,
      senderAddress: senderAddress.toLowerCase(),
      title,
      docType,
      date,
      sharedAt,
      rootHash,
    }

    // Write to persistent DB
    const existingShares = await getPersistentShares(recipientAddrLower)
    const updatedShares = [...existingShares.filter(s => s.rootHash !== rootHash), newEntry]
    await savePersistentShares(recipientAddrLower, updatedShares)

    // Legacy local fallback write
    const localRegistry = readLocalRegistry()
    localRegistry.push(newEntry)
    writeLocalRegistry(localRegistry)

    return NextResponse.json({ success: true, record: newEntry })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
