import { NextResponse } from 'next/server'
import dns from 'dns/promises'
import net from 'net'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleProxy(req)
}

export async function GET(req: Request) {
  return handleProxy(req)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

const STRIPPED_RESPONSE_HEADERS = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'access-control-allow-origin',
]

const MAX_PROXY_BYTES = 20 * 1024 * 1024

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    return (
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] === 0
    )
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  }
  return true
}

async function assertSafeTarget(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid target url')
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported target protocol')
  if (!url.hostname) throw new Error('Invalid target host')

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local')) throw new Error('Blocked private target')

  // Resolve hostnames and block private/internal IP ranges. Public 0G storage
  // nodes may be IP-backed, so we cannot allowlist only *.0g.ai, but we must
  // prevent this endpoint from becoming a generic SSRF proxy to metadata/admin
  // services or private networks.
  const records = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true })
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('Blocked private target')
  }
  return url
}

async function readLimitedBody(req: Request): Promise<ArrayBuffer | undefined> {
  if (req.method !== 'POST') return undefined
  const len = Number(req.headers.get('content-length') || 0)
  if (len > MAX_PROXY_BYTES) throw new Error('Proxy request body too large')
  return req.arrayBuffer()
}

async function handleProxy(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const targetRaw = searchParams.get('url')
    if (!targetRaw) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 })
    }
    const targetUrl = await assertSafeTarget(targetRaw)

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })

    const body = await readLimitedBody(req)
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const responseBuffer = await response.arrayBuffer()
    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.includes(key.toLowerCase())) responseHeaders.set(key, value)
    })
    responseHeaders.set('Access-Control-Allow-Origin', '*')

    return new NextResponse(responseBuffer, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
