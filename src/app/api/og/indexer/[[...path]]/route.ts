import { NextResponse } from 'next/server'
import { verifyAuth, checkRateLimit } from '@/lib/server/auth'

// Edge runtime: near-zero cold start for the indexer JSON-RPC control-plane
// calls (getShardedNodes / getFileLocations). These are small JSON payloads, so
// edge is a good fit and removes serverless cold-start latency on the hot path.
export const runtime = 'edge'

const OG_MAINNET_INDEXER = 'https://indexer-storage-turbo.0g.ai'

const MAX_BODY_BYTES = 32 * 1024 // 32 KB

// Read-only JSON-RPC methods that the 0G SDK calls internally during
// upload/download operations. These can't carry auth headers (the SDK
// makes its own fetch() calls), so they're exempted from auth.
// They only return storage node metadata and file locations — not user data.
const UNAUTHED_READ_METHODS = new Set([
  'getShardedNodes',
  'getFileLocations',
  'downloadToBlob',
  'downloadSegment',
  'downloadFileMeta',
  'peekHeader',
  'getFileSummary',
  'getFileInfo',
])

/** Check if a POST body contains only read-only methods that don't need auth. */
function isReadOnlyBody(body: ArrayBuffer | undefined): boolean {
  if (!body) return false
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body))
    const reqs = Array.isArray(parsed) ? parsed : [parsed]
    return reqs.every(
      (r: any) => typeof r?.method === 'string' && UNAUTHED_READ_METHODS.has(r.method),
    )
  } catch {
    return false
  }
}

export async function POST(req: Request, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path ?? [])
}

export async function GET(req: Request, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path ?? [])
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-medivault-auth',
    },
  })
}

// Upstream response headers that must NOT be forwarded verbatim. `fetch`
// transparently DECOMPRESSES the response body, so forwarding the upstream
// `content-encoding`/`content-length` would describe the COMPRESSED payload
// while we return the DECOMPRESSED bytes -- truncating the JSON-RPC response
// and making indexer_getShardedNodes come back empty/undefined.
const STRIPPED_RESPONSE_HEADERS = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'access-control-allow-origin',
]

async function handleProxy(req: Request, pathArray: string[] = []) {
  try {
    let body: ArrayBuffer | undefined
    if (req.method === 'POST') {
      body = await req.arrayBuffer()
      if (body.byteLength > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
      }
    }

    // Allow read-only indexer queries without auth — the 0G SDK makes
    // internal fetch() calls that can't carry auth headers.
    // All other requests (e.g. custom writes) require authentication.
    if (!isReadOnlyBody(body)) {
      const auth = verifyAuth(req)
      if (!auth.ok) return auth.response

      if (!checkRateLimit(auth.address, 'indexer', 60)) {
        return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
      }
    }

    const path = pathArray.join('/')
    const { search } = new URL(req.url)
    // The indexer JSON-RPC endpoint lives at the bare origin. Do NOT append a
    // trailing slash when there is no sub-path.
    const targetUrl = path
      ? `${OG_MAINNET_INDEXER}/${path}${search}`
      : `${OG_MAINNET_INDEXER}${search}`

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection', 'content-length', 'x-medivault-auth'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const responseBuffer = await response.arrayBuffer()
    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })
    responseHeaders.set('Access-Control-Allow-Origin', '*')

    return new NextResponse(responseBuffer, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 })
  }
}
