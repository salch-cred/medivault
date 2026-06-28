import { NextRequest, NextResponse } from 'next/server'
import { getAiClient, getAiModel, parseJsonLoose } from '@/lib/ai/client'
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
} from '@/lib/ai/prompts'
import { normalizeExtraction } from '@/lib/ai/normalize'
import { verifyAuth, clamp, LIMITS, checkRateLimit } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    // Per-address rate limiting to prevent abuse of the LLM proxy.
    if (!checkRateLimit(auth.address, 'extract', 10)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 })
    }

    const { text, language, eli5 } = (await req.json()) as {
      text?: string
      language?: string
      eli5?: boolean
    }
    const safeText = clamp(text, LIMITS.MAX_TEXT)
    if (!safeText.trim()) {
      return NextResponse.json({ error: 'No document text provided.' }, { status: 400 })
    }

    // Use the centralized AI client pointed at 0G Compute (not raw fetch
    // with a Mistral fallback that contradicts the documentation).
    const client = getAiClient()
    const model = getAiModel()

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 2500,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionUserPrompt(safeText, language, eli5) }
      ]
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'

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
