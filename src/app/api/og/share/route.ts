import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Path to store shared metadata registry in the workspace
const REGISTRY_FILE = path.join(process.cwd(), 'scratch', 'shared_records.json')

// Helper to read the registry
function readRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_FILE)) {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true })
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify([]))
      return []
    }
    const data = fs.readFileSync(REGISTRY_FILE, 'utf8')
    return JSON.parse(data)
  } catch (e) {
    console.error('Error reading shared records registry:', e)
    return []
  }
}

// Helper to write to the registry
function writeRegistry(data: any) {
  try {
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
