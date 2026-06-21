import { NextResponse } from 'next/server'
import { verifyAuth, checkRateLimit } from '@/lib/server/auth'

// Edge runtime: near-zero cold start for this small JSON-RPC control-plane
// proxy (chain reads, gas price, nonce, tx submit), shaving latency off every
// upload round trip.
export const runtime = 'edge'

const OG_MAINNET_RPC = 'https://evmrpc.0g.ai'

// Allowed JSON-RPC methods for this proxy (read-only control plane operations).
const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_call',
  'eth_estimateGas',
  'net_version',
  'net_listening',
  'eth_getStorageAt',
  'eth_getCode',
  'eth_getLogs',
  'eth_getBlockByHash',
])

const MAX_BATCH_SIZE = 10
const MAX_BODY_BYTES = 32 * 1024 // 32 KB — JSON-RPC payloads should be small

export async function POST(req: Request) {
  try {
    // Require authentication for RPC proxy access.
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    if (!checkRateLimit(auth.address, 'rpc', 60)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
    }

    const bodyText = await req.text()
    if (bodyText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
    }

    // Parse and validate the JSON-RPC request to restrict to allowed methods.
    let rpcReq: unknown
    try {
      rpcReq = JSON.parse(bodyText)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }

    // Handle single request or batch request.
    const requests = Array.isArray(rpcReq) ? rpcReq : [rpcReq]
    if (requests.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: 'Batch too large.' }, { status: 400 })
    }

    for (const r of requests) {
      const method = (r as Record<string, unknown>)?.method
      if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
        return NextResponse.json(
          { error: 'Method not allowed.' },
          { status: 403 },
        )
      }
    }

    // Forward to 0G Mainnet RPC (chain 16661).
    const response = await fetch(OG_MAINNET_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: bodyText,
    })

    const data = await response.text()
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
