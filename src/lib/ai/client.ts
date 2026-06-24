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

/** Error thrown when parseJsonLoose cannot find any JSON object in the input. */
export class ParseJsonError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message)
    this.name = 'ParseJsonError'
  }
}

/**
 * Strip markdown fences / prose and parse the first JSON object found.
 *
 * Throws {@link ParseJsonError} (a typed subclass of Error) when the input
 * contains no JSON object at all, so callers can distinguish "model returned
 * no JSON" from a generic JSON.parse syntax error.
 */
export function parseJsonLoose<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1)
  } else if (start === -1) {
    // FIX: no JSON braces found — throw a typed error instead of calling
    // JSON.parse on raw prose, which produces a confusing syntax error.
    throw new ParseJsonError(
      'No JSON object found in model response',
      raw,
    )
  }
  try {
    return JSON.parse(text) as T
  } catch (e) {
    // Re-throw as ParseJsonError so callers always catch the same type.
    throw new ParseJsonError(
      e instanceof Error ? e.message : 'Failed to parse JSON from model response',
      raw,
    )
  }
}
