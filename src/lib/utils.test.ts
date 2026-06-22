import { describe, it, expect } from 'vitest'
import {
  shortHash,
  formatBytes,
  classifyFlag,
  extensionForMime,
} from './utils'

describe('utility helpers', () => {
  describe('shortHash', () => {
    it('returns empty string for empty input', () => {
      expect(shortHash('')).toBe('')
    })

    it('returns original string if it is short enough', () => {
      expect(shortHash('12345', 10, 6)).toBe('12345')
    })

    it('truncates hash with ellipsis', () => {
      expect(shortHash('0x1234567890abcdef1234567890', 4, 4)).toBe('0x12\u20267890')
    })
  })

  describe('formatBytes', () => {
    it('handles empty and null values', () => {
      expect(formatBytes(null)).toBe('—')
      expect(formatBytes(undefined)).toBe('—')
    })

    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(1024)).toBe('1.0 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(1048576)).toBe('1.0 MB')
    })
  })

  describe('classifyFlag', () => {
    it('classifies flag values correctly', () => {
      expect(classifyFlag('LOW')).toBe('low')
      expect(classifyFlag('normal')).toBe('normal')
      expect(classifyFlag('HIGH')).toBe('high')
      expect(classifyFlag('invalid')).toBe('unknown')
    })
  })

  describe('extensionForMime', () => {
    it('returns empty string for unknown/empty MIME types', () => {
      expect(extensionForMime('')).toBe('')
      expect(extensionForMime('application/unknown')).toBe('')
    })

    it('returns dot extensions for known MIME types', () => {
      expect(extensionForMime('application/pdf')).toBe('.pdf')
      expect(extensionForMime('image/png')).toBe('.png')
      expect(extensionForMime('text/plain')).toBe('.txt')
    })
  })
})
