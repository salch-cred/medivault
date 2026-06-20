import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.text()
    
    // Forward to 0G EVM Testnet RPC
    const response = await fetch('https://evmrpc-testnet.0g.ai', {
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
