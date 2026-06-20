import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  return handleProxy(req)
}

export async function GET(req: Request) {
  return handleProxy(req)
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

async function handleProxy(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const targetUrl = searchParams.get('url')

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 })
    }

    // Read the request headers, but omit host-specific headers
    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })

    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    })

    const responseBuffer = await response.arrayBuffer()
    const responseHeaders = new Headers()
    
    // Copy response headers, handling CORS
    response.headers.forEach((value, key) => {
      if (!['access-control-allow-origin', 'content-encoding'].includes(key.toLowerCase())) {
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
