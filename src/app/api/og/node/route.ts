import { NextResponse } from 'next/server'
import dns from 'dns/promises'
import net from 'net'
import { verifyAuth, checkRateLimit } from '@/lib/server/auth'

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-medivault-auth',
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
const MAX_REDIRECTS = 3

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
    // Check for loopback, unique local, link-local, and IPv4-mapped private addresses
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      // IPv4-mapped IPv6 addresses (e.g. ::ffff:10.0.0.1)
      lower.includes('::ffff:')
    )
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

/**
 * Fetch with SSRF-safe redirect handling.
 * We manually follow redirects and re-validate each redirect target.
 */
async function safeFetch(
  targetUrl: URL,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
  redirectCount = 0,
): Promise<Response> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('Too many redirects')
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'manual', // Don't auto-follow redirects — we validate each hop
  })

  // Handle redirects manually so we can re-validate the target.
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect with no location header')

    // Resolve relative redirects against the current URL.
    const redirectUrl = new URL(location, targetUrl)
    // Re-validate the redirect target to prevent SSRF via redirect.
    const safeRedirectUrl = await assertSafeTarget(redirectUrl.toString())
    return safeFetch(safeRedirectUrl, method, headers, body, redirectCount + 1)
  }

  return response
}

async function handleProxy(req: Request) {
  try {
    // Require authentication for node proxy access.
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    if (!checkRateLimit(auth.address, 'node-proxy', 30)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const targetRaw = searchParams.get('url')
    if (!targetRaw) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 })
    }
    const targetUrl = await assertSafeTarget(targetRaw)

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection', 'content-length', 'x-medivault-auth'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })

    const body = await readLimitedBody(req)
    const response = await safeFetch(targetUrl, req.method, headers, body)

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
    return NextResponse.json({ error: 'Proxy request failed.' }, { status: 400 })
  }
}
