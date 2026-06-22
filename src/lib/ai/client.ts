import OpenAI from 'openai'

// Server-side only. Points an OpenAI-compatible client at 0G Compute
// (decentralized inference). Never import this from client components.
export function getAiClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY
  const baseURL = process.env.AI_BASE_URL ?? 'https://router-api.0g.ai/v1'
  if (!apiKey) {
    throw new Error(
      'AI_API_KEY is not set. Add your 0G Compute key to .env.local (see .env.example).',
    )
  }
  return new OpenAI({ apiKey, baseURL })
}

export function getAiModel(): string {
  const model = process.env.AI_MODEL
  if (!model) {
    throw new Error(
      'AI_MODEL is not set. Set it to a model served by 0G Compute (see https://router-api.0g.ai).',
    )
  }
  return model
}

/** Strip markdown fences / prose and parse the first JSON object found. */
export function parseJsonLoose<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1)
  }
  return JSON.parse(text) as T
}
