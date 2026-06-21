import { NextResponse } from 'next/server'

const OG_TESTNET_RPC = 'https://evmrpc-testnet.0g.ai'

export async function POST(req: Request) {
  try {
    const body = await req.text()

    // Forward to 0G Galileo Testnet RPC (chain 16602).
    // This must match src/lib/og/config.ts, README, and .env.example.
    const response = await fetch(OG_TESTNET_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    })

    const data = await response.text()
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
