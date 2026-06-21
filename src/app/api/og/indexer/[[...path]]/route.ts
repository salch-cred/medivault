import { NextResponse } from 'next/server'

const OG_TESTNET_INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'

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

async function handleProxy(req: Request, pathArray: string[] = []) {
  try {
    const path = pathArray.join('/')
    const { search } = new URL(req.url)
    const targetUrl = `${OG_TESTNET_INDEXER}/${path}${search}`

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      if (!['host', 'origin', 'referer', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/octet-stream')
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
