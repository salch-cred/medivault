import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const PUBKEYS_FILE = path.join(process.cwd(), 'scratch', 'public_keys.json')

function readKeys() {
  try {
    if (!fs.existsSync(PUBKEYS_FILE)) {
      fs.mkdirSync(path.dirname(PUBKEYS_FILE), { recursive: true })
      fs.writeFileSync(PUBKEYS_FILE, JSON.stringify({}))
      return {}
    }
    const data = fs.readFileSync(PUBKEYS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (e) {
    console.error('Error reading pubkeys registry:', e)
    return {}
  }
}

function writeKeys(data: any) {
  try {
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
