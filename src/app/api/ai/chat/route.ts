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
        tools: [
          {
            type: "function",
            function: {
              name: "share_record",
              description: "Triggers when the user asks to share a medical record with someone. You must extract the recipient's wallet address and the sender's name from the prompt.",
              parameters: {
                type: "object",
                properties: {
                  recordId: { type: "string", description: "The ID of the record the user wants to share" },
                  recipientAddress: { type: "string", description: "The 0x... EVM wallet address of the recipient" },
                  senderName: { type: "string", description: "The name of the user sharing the record (if they provided one)" }
                },
                required: ["recordId", "recipientAddress", "senderName"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "fund_wallet",
              description: "Triggers when the user wants to transfer/send/swap OG tokens from their main wallet to their auto-wallet. Use this when the user says things like 'fund my auto wallet', 'send 0.5 OG to auto wallet', 'swap to auto wallet', 'top up auto wallet', or 'transfer funds'. Extract the amount they want to send.",
              parameters: {
                type: "object",
                properties: {
                  amount: { type: "string", description: "The amount of OG tokens to transfer (e.g. '0.5', '1', '0.01'). If the user says 'all' or 'max', use 'max'." }
                },
                required: ["amount"]
              }
            }
          }
        ]
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`API returned ${res.status}: ${errText}`)
    }

    const data = await res.json()

    // If the AI decides to use a tool, return the tool calls to the client
    if (data.choices?.[0]?.message?.tool_calls?.length > 0) {
      return NextResponse.json({ 
        toolCalls: data.choices[0].message.tool_calls 
      })
    }

    const answer = data.choices?.[0]?.message?.content ?? 'I could not generate an answer.'

    return NextResponse.json({ answer })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI chat failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
