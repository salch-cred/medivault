import { NextRequest, NextResponse } from 'next/server'
import { getAiClient, getAiModel, parseJsonLoose } from '@/lib/ai/client'
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '@/lib/ai/prompts'
import { normalizeExtraction } from '@/lib/ai/normalize'
import { verifyAuth, clamp, LIMITS } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const { text, language, eli5 } = (await req.json()) as {
      text?: string
      language?: string
      eli5?: boolean
    }
    const safeText = clamp(text, LIMITS.MAX_TEXT)
    if (!safeText.trim()) {
      return NextResponse.json({ error: 'No document text provided.' }, { status: 400 })
    }

    const apiKey = process.env.AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI_API_KEY is not configured.' }, { status: 500 })
    }
    const baseUrl = process.env.AI_BASE_URL || 'https://api.mistral.ai/v1'
    const model = process.env.AI_MODEL || 'open-mistral-nemo'

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Connection': 'close'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 2500,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: buildExtractionUserPrompt(safeText, language, eli5) }
        ]
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`API returned ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const raw = data.choices[0]?.message?.content ?? '{}'

    let result
    try {
      result = normalizeExtraction(parseJsonLoose(raw))
    } catch {
      // Model returned unparseable output; fall back to an empty extraction
      // rather than surfacing a raw JSON parse error to the user.
      result = normalizeExtraction({})
    }
    return NextResponse.json({ result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI extraction failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
