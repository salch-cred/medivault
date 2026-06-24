import { describe, it, expect } from 'vitest'
import {
  buildAnchorData,
  parseAnchorData,
  ANCHOR_PREFIX,
} from './anchor'

describe('anchor utilities', () => {
  const validRoot = '0x' + 'ab'.repeat(32)

  describe('buildAnchorData', () => {
    it('produces hex calldata with MV-IDX1: prefix + root hash', () => {
      const data = buildAnchorData(validRoot)
      expect(data).toMatch(/^0x/)
      const text = Buffer.from(data.slice(2), 'hex').toString('utf8')
      expect(text.startsWith(ANCHOR_PREFIX)).toBe(true)
      expect(text).toContain(validRoot.toLowerCase())
    })

    it('lowercases the root hash in the calldata', () => {
      const upperRoot = '0x' + 'AB'.repeat(32)
      const data = buildAnchorData(upperRoot)
      const text = Buffer.from(data.slice(2), 'hex').toString('utf8')
      expect(text).toContain(upperRoot.toLowerCase())
    })
  })

  describe('parseAnchorData', () => {
    it('round-trips through buildAnchorData', () => {
      const data = buildAnchorData(validRoot)
      const parsed = parseAnchorData(data)
      expect(parsed).toBe(validRoot.toLowerCase())
    })

    it('returns null for empty calldata', () => {
      expect(parseAnchorData('0x')).toBeNull()
      expect(parseAnchorData('')).toBeNull()
    })

    it('returns null for non-anchor calldata', () => {
      const randomData = '0x' + Buffer.from('some random data').toString('hex')
      expect(parseAnchorData(randomData)).toBeNull()
    })

    it('returns null for calldata with wrong prefix', () => {
      const wrongPrefix = '0x' + Buffer.from('WRONG:' + validRoot).toString('hex')
      expect(parseAnchorData(wrongPrefix)).toBeNull()
    })

    it('returns null for malformed hex', () => {
      expect(parseAnchorData('0xZZ')).toBeNull()
    })

    it('returns a lowercase root hash', () => {
      const data = buildAnchorData('0x' + 'CD'.repeat(32))
      const parsed = parseAnchorData(data)
      expect(parsed).toBe('0x' + 'cd'.repeat(32))
    })
  })
})
