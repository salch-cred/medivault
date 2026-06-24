import { describe, it, expect } from 'vitest'
import { parseJsonLoose } from './client'

describe('parseJsonLoose', () => {
  it('parses plain JSON object', () => {
    const result = parseJsonLoose('{ "name": "test" }')
    expect(result).toEqual({ name: 'test' })
  })

  it('parses JSON wrapped in ```json fences', () => {
    const raw = '```json\n{ "name": "test" }\n```'
    const result = parseJsonLoose(raw)
    expect(result).toEqual({ name: 'test' })
  })

  it('parses JSON wrapped in plain ``` fences', () => {
    const raw = '```\n{ "name": "test" }\n```'
    const result = parseJsonLoose<{ name: string }>(raw)
    expect(result.name).toBe('test')
  })

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Here is the result:\n{ "value": 42 }\nDone.'
    const result = parseJsonLoose<{ value: number }>(raw)
    expect(result.value).toBe(42)
  })

  it('handles JSON with nested objects', () => {
    const raw = '{ "outer": { "inner": true } }'
    const result = parseJsonLoose<{ outer: { inner: boolean } }>(raw)
    expect(result.outer.inner).toBe(true)
  })

  it('handles JSON with arrays', () => {
    const raw = '{ "items": [1, 2, 3] }'
    const result = parseJsonLoose<{ items: number[] }>(raw)
    expect(result.items).toEqual([1, 2, 3])
  })

  it('throws on text with no JSON braces', () => {
    expect(() => parseJsonLoose('No JSON here at all')).toThrow()
  })

  it('throws on malformed JSON', () => {
    expect(() => parseJsonLoose('{ invalid json }')).toThrow()
  })

  it('handles leading/trailing whitespace', () => {
    const result = parseJsonLoose('  { "x": 1 }  ')
    expect(result).toEqual({ x: 1 })
  })

  it('handles JSON with trailing commas (throws — JSON.parse does not accept them)', () => {
    expect(() => parseJsonLoose('{ "x": 1, }')).toThrow()
  })
})
