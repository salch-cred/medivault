import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Reports which inference network is actually serving AI requests, derived from
// server-side env. NEVER returns the API key — only the non-sensitive host and
// model name. This lets the UI render a truthful "Analyzed on 0G Compute" badge
// (reflecting the real configured endpoint) instead of a hard-coded claim.
export async function GET() {
  const baseUrl = process.env.AI_BASE_URL ?? 'https://router-api.0g.ai/v1'
  const model = process.env.AI_MODEL ?? null

  let host = ''
  try {
    host = new URL(baseUrl).host
  } catch {
    host = baseUrl
  }

  // True when inference is served by a 0G Compute endpoint (e.g. router-api.0g.ai).
  const on0g = /(?:^|\.)0g\.ai$/i.test(host)

  return NextResponse.json({
    on0g,
    host,
    model,
    label: on0g ? '0G Compute' : host || 'AI provider',
  })
}
