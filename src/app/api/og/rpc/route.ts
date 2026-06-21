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
  'eth_feeData',
  'net_version',
  'net_listening',
  'eth_getStorageAt',
  'eth_getCode',
  'eth_getLogs',
  'eth_getBlockByHash',
])

// Read-only methods that are safe to expose without auth. The 0G SDK makes
// internal fetch() calls to this proxy during upload() and downloadToBlob()
// that cannot be modified to include auth headers. These methods are all
// benign reads — an attacker gains nothing from calling them.
// Write methods (eth_sendRawTransaction) are NOT in ALLOWED_METHODS at all.
const UNAUTHED_READ_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_estimateGas',
  'eth_feeData',
  'net_version',
  'net_listening',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionReceipt',
  'eth_call',
  'eth_getCode',
  'eth_getStorageAt',
])

const MAX_BATCH_SIZE = 10
const MAX_BODY_BYTES = 32 * 1024 // 32 KB — JSON-RPC payloads should be small

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()
    if (bodyText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
    }

    let rpcReq: unknown
    try {
      rpcReq = JSON.parse(bodyText)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }

    const requests = Array.isArray(rpcReq) ? rpcReq : [rpcReq]
    if (requests.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: 'Batch too large.' }, { status: 400 })
    }

    // Validate methods and determine if auth is needed.
    let needsAuth = false
    for (const r of requests) {
      const method = (r as Record<string, unknown>)?.method
      if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
        return NextResponse.json(
          { error: 'Method not allowed.' },
          { status: 403 },
        )
      }
      if (!UNAUTHED_READ_METHODS.has(method)) {
        needsAuth = true
      }
    }

    // Only require auth for eth_getLogs (could be used for data exfiltration).
    // All other allowed methods are read-only and safe to expose without auth
    // since the 0G SDK makes internal calls that can't carry auth headers.
    // Write methods (eth_sendRawTransaction) are NOT in ALLOWED_METHODS at all.
    if (needsAuth) {
      const auth = verifyAuth(req)
      if (!auth.ok) return auth.response

      if (!checkRateLimit(auth.address, 'rpc', 60)) {
        return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
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
