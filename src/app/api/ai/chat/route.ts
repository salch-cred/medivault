import { NextRequest, NextResponse } from 'next/server'
import { getAiClient, getAiModel } from '@/lib/ai/client'
import {
  CHAT_SYSTEM_PROMPT,
  eli5Instruction,
  languageInstruction,
} from '@/lib/ai/prompts'
import { verifyAuth, clamp, LIMITS } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

type RecordContext = {
  id: string
  title: string
  date: string | null
  docType: string
  summary: string
}

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const { question, records, language, eli5 } = (await req.json()) as {
      question?: string
      records?: RecordContext[]
      language?: string
      eli5?: boolean
    }
    const safeQuestion = clamp(question, LIMITS.MAX_QUESTION)
    if (!safeQuestion.trim()) {
      return NextResponse.json({ error: 'No question provided.' }, { status: 400 })
    }

    // Cap the number of records and the size of each summary to bound cost.
    const safeRecords = (records ?? []).slice(0, LIMITS.MAX_RECORDS).map((r) => ({
      ...r,
      title: clamp(r.title, 200),
      summary: clamp(r.summary, 4000),
    }))

    const context = safeRecords
      .map(
        (r, i) =>
          `RECORD ${i + 1} [${r.title} | ${r.docType} | ${r.date ?? 'undated'} | id:${r.id}]\n${r.summary}`,
      )
      .join('\n\n')

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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: CHAT_SYSTEM_PROMPT + languageInstruction(language, true) + eli5Instruction(eli5),
          },
          {
            role: 'user',
            content:
              `Here are the user's stored records:\n\n${context || '(no records yet)'}\n\n` +
              `Question: ${safeQuestion}\n\n` +
              'Answer ONLY from these records and cite each supporting record by its title.',
          },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`API returned ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const answer = data.choices?.[0]?.message?.content ?? 'I could not generate an answer.'

    return NextResponse.json({ answer })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI chat failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
