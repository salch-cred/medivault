import { NextResponse } from 'next/server'

// Edge runtime: near-zero cold start for this small JSON-RPC control-plane
// proxy (chain reads, gas price, nonce, tx submit), shaving latency off every
// upload round trip.
export const runtime = 'edge'

const OG_MAINNET_RPC = 'https://evmrpc.0g.ai'

export async function POST(req: Request) {
  try {
    const body = await req.text()

    // Forward to 0G Mainnet RPC (chain 16661).
    // This must match src/lib/og/config.ts and the deployed app UI.
    const response = await fetch(OG_MAINNET_RPC, {
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
