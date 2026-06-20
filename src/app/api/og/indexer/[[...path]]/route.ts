import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path)
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  return handleProxy(req, params.path)
}

export async function OPTIONS(req: Request) {
  // Handle CORS preflight explicitly just in case
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
    const targetUrl = `https://indexer-storage-turbo.0g.ai/${path}`
    
    // We only read body for POST requests
    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers.get('Content-Type') || 'application/octet-stream',
      },
      body,
    })
    
    const responseBuffer = await response.arrayBuffer()
    return new NextResponse(responseBuffer, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
