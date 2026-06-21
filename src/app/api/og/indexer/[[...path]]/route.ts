import { NextResponse } from 'next/server'

// Edge runtime: near-zero cold start for the indexer JSON-RPC control-plane
// calls (getShardedNodes / getFileLocations). These are small JSON payloads, so
// edge is a good fit and removes serverless cold-start latency on the hot path.
export const runtime = 'edge'

const OG_MAINNET_INDEXER = 'https://indexer-storage-turbo.0g.ai'

export async function POST(req: Request, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path ?? [])
}

export async function GET(req: Request, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path ?? [])
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const path = pathArray.join('/')
    const { search } = new URL(req.url)
    // The indexer JSON-RPC endpoint lives at the bare origin. Do NOT append a
    // trailing slash when there is no sub-path.
    const targetUrl = path
      ? `${OG_MAINNET_INDEXER}/${path}${search}`
      : `${OG_MAINNET_INDEXER}${search}`

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
