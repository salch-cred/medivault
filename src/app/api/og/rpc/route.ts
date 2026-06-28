import { NextResponse } from 'next/server'
import { verifyAuth, checkRateLimit } from '@/lib/server/auth'

export const runtime = 'edge'

const OG_MAINNET_RPC = 'https://evmrpc.0g.ai'

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
const MAX_BODY_BYTES = 32 * 1024
// FIX: bound eth_getLogs queries to prevent upstream bandwidth exhaustion.
// An unbounded log query (no fromBlock/toBlock) can scan the entire 0G chain
// and return MB of data, causing upstream timeouts and OOM on the proxy.
const MAX_LOG_BLOCK_RANGE = 10_000

/**
 * Validate eth_getLogs params to ensure a bounded block range is specified.
 * Returns an error string if validation fails, or null if params are safe.
 */
function validateGetLogsParams(params: unknown): string | null {
  if (!Array.isArray(params) || params.length === 0) {
    return 'eth_getLogs requires a filter object parameter'
  }
  const filter = params[0] as Record<string, unknown>
  if (!filter || typeof filter !== 'object') {
    return 'eth_getLogs filter must be an object'
  }
  // Both fromBlock and toBlock must be present as hex strings or 'latest'
  const { fromBlock, toBlock } = filter
  if (!fromBlock || !toBlock) {
    return 'eth_getLogs requires both fromBlock and toBlock to prevent unbounded scans'
  }
  // Allow 'latest' only for toBlock (fromBlock must be a specific block)
  if (typeof fromBlock !== 'string' || typeof toBlock !== 'string') {
    return 'eth_getLogs fromBlock and toBlock must be strings'
  }
  // If both are hex block numbers, enforce the range window
  if (fromBlock.startsWith('0x') && toBlock.startsWith('0x')) {
    const from = parseInt(fromBlock, 16)
    const to = parseInt(toBlock, 16)
    if (!isNaN(from) && !isNaN(to) && to - from > MAX_LOG_BLOCK_RANGE) {
      return `eth_getLogs block range exceeds maximum of ${MAX_LOG_BLOCK_RANGE} blocks`
    }
  }
  return null
}

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

    let needsAuth = false
    for (const r of requests) {
      const rr = r as Record<string, unknown>
      const method = rr?.method
      if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
        return NextResponse.json({ error: 'Method not allowed.' }, { status: 403 })
      }
      if (!UNAUTHED_READ_METHODS.has(method)) {
        needsAuth = true
      }
      // FIX: validate eth_getLogs params to enforce a bounded block range.
      if (method === 'eth_getLogs') {
        const err = validateGetLogsParams(rr.params)
        if (err) {
          return NextResponse.json({ error: err }, { status: 400 })
        }
      }
    }

    if (needsAuth) {
      const auth = verifyAuth(req)
      if (!auth.ok) return auth.response

      if (!checkRateLimit(auth.address, 'rpc', 60)) {
        return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
      }
    }

    const response = await fetch(OG_MAINNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
