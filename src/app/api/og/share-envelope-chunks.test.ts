/**
 * Tests for the share-envelope chunking logic in /api/og/share-envelope.
 *
 * The chunking/reassembly logic is an important correctness constraint:
 * if a chunk boundary falls in the wrong place or the manifest is written
 * before all chunks are present, the recipient gets an empty envelope.
 * These unit tests exercise the pure logic without hitting the KV store.
 */
import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers extracted from the route (mirrors the route's logic exactly)
// ────────────────────────────────────────────────────────────────────────────

const CHUNK_CHARS = 16_000
const MAX_CHUNKS = 8

function envKey(hash: string): string {
  return `shareenv_${hash.toLowerCase()}`
}

function decodeHexToJson(hex: string): unknown | null {
  if (!hex) return null
  let decoded = ''
  try { decoded = Buffer.from(hex, 'hex').toString('utf8') } catch { return null }
  if (!decoded) return null
  try { return JSON.parse(decoded) } catch { return null }
}

function encodeToHex(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('hex')
}

/** Split an envelope into hex chunks (mirrors the route's POST logic). */
function splitEnvelope(envelope: unknown): { chunks: string[]; manifest: string } | null {
  const hex = encodeToHex(envelope)
  if (hex.length <= CHUNK_CHARS) return null // small enough, no chunking needed
  const chunks: string[] = []
  for (let i = 0; i < hex.length; i += CHUNK_CHARS) {
    chunks.push(hex.slice(i, i + CHUNK_CHARS))
  }
  if (chunks.length > MAX_CHUNKS) return null // too large
  const manifest = encodeToHex({ __chunks: chunks.length })
  return { chunks, manifest }
}

/** Reassemble chunks into an envelope (mirrors the route's GET logic). */
function reassembleChunks(manifest: string, getChunk: (i: number) => string): unknown | null {
  const parsedManifest = decodeHexToJson(manifest)
  if (
    !parsedManifest ||
    typeof parsedManifest !== 'object' ||
    typeof (parsedManifest as { __chunks?: unknown }).__chunks !== 'number'
  ) return null
  const n = (parsedManifest as { __chunks: number }).__chunks
  if (!Number.isInteger(n) || n < 1 || n > MAX_CHUNKS) return null
  let hex = ''
  for (let i = 0; i < n; i++) {
    const part = getChunk(i)
    if (!part) return null
    hex += part
  }
  return decodeHexToJson(hex)
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('envKey', () => {
  it('lowercases the hash', () => {
    expect(envKey('0xABCD')).toBe('shareenv_0xabcd')
  })

  it('produces consistent keys', () => {
    const hash = '0x' + 'ab'.repeat(32)
    expect(envKey(hash)).toBe(`shareenv_${hash}`)
  })
})

describe('decodeHexToJson', () => {
  it('decodes a hex-encoded JSON object', () => {
    const obj = { key: 'value', num: 42 }
    const hex = encodeToHex(obj)
    expect(decodeHexToJson(hex)).toEqual(obj)
  })

  it('returns null for empty string', () => {
    expect(decodeHexToJson('')).toBeNull()
  })

  it('returns null for invalid hex', () => {
    expect(decodeHexToJson('not-hex!')).toBeNull()
  })

  it('returns null for hex that decodes to non-JSON', () => {
    const hex = Buffer.from('this is not json').toString('hex')
    expect(decodeHexToJson(hex)).toBeNull()
  })

  it('handles nested objects', () => {
    const obj = { a: { b: { c: [1, 2, 3] } } }
    expect(decodeHexToJson(encodeToHex(obj))).toEqual(obj)
  })
})

describe('chunking logic', () => {
  it('does not chunk small envelopes', () => {
    const small = { ct: 'a'.repeat(100), iv: 'b'.repeat(24) }
    expect(splitEnvelope(small)).toBeNull()
  })

  it('chunks large envelopes correctly', () => {
    // Create an envelope whose hex exceeds CHUNK_CHARS
    const large = { ct: 'a'.repeat(10_000), iv: 'b'.repeat(24), v: 2 }
    const result = splitEnvelope(large)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.chunks.length).toBeLessThanOrEqual(MAX_CHUNKS)
    // Each chunk must be <= CHUNK_CHARS
    for (const chunk of result.chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_CHARS)
    }
  })

  it('returns null for envelopes that would require more than MAX_CHUNKS chunks', () => {
    // Each char in the input produces ~2 hex chars; to exceed 8 * 16000 = 128000 hex chars
    // we need a JSON string of ~64001+ chars
    const giant = { ct: 'a'.repeat(65_000) }
    expect(splitEnvelope(giant)).toBeNull()
  })

  it('roundtrips a chunked envelope correctly', () => {
    const large = { ct: 'x'.repeat(10_000), iv: 'y'.repeat(24), v: 2, alg: 'test' }
    const result = splitEnvelope(large)
    expect(result).not.toBeNull()
    if (!result) return

    const reassembled = reassembleChunks(result.manifest, (i) => result.chunks[i])
    expect(reassembled).toEqual(large)
  })

  it('returns null on reassembly if any chunk is missing', () => {
    const large = { ct: 'x'.repeat(10_000), iv: 'y'.repeat(24), v: 2 }
    const result = splitEnvelope(large)
    if (!result) return // skip if not chunked

    // Return empty string for chunk index 1 (simulating a missing chunk)
    const reassembled = reassembleChunks(result.manifest, (i) => (i === 1 ? '' : result.chunks[i]))
    expect(reassembled).toBeNull()
  })

  it('manifest JSON contains the correct chunk count', () => {
    const large = { ct: 'a'.repeat(10_000), iv: 'b'.repeat(24), v: 2 }
    const result = splitEnvelope(large)
    if (!result) return
    const manifest = decodeHexToJson(result.manifest) as { __chunks: number }
    expect(manifest.__chunks).toBe(result.chunks.length)
  })

  it('chunks sum to the original hex', () => {
    const large = { ct: 'a'.repeat(10_000), iv: 'b'.repeat(24), v: 2 }
    const result = splitEnvelope(large)
    if (!result) return
    const original = encodeToHex(large)
    const joined = result.chunks.join('')
    expect(joined).toBe(original)
  })
})

describe('manifest validation in reassembly', () => {
  it('returns null for a non-manifest primary value', () => {
    const nonManifest = encodeToHex({ data: 'something' })
    expect(reassembleChunks(nonManifest, () => '')).toBeNull()
  })

  it('returns null when __chunks is 0', () => {
    const badManifest = encodeToHex({ __chunks: 0 })
    expect(reassembleChunks(badManifest, () => '')).toBeNull()
  })

  it('returns null when __chunks exceeds MAX_CHUNKS', () => {
    const badManifest = encodeToHex({ __chunks: MAX_CHUNKS + 1 })
    expect(reassembleChunks(badManifest, () => '')).toBeNull()
  })

  it('returns null when __chunks is not an integer', () => {
    const badManifest = encodeToHex({ __chunks: 1.5 })
    expect(reassembleChunks(badManifest, () => '')).toBeNull()
  })
})
