import { describe, it, expect } from 'vitest'
import {
  shortHash,
  formatBytes,
  classifyFlag,
  extensionForMime,
  formatDate,
  formatRelative,
  isTextLike,
  isImageMime,
  isPdfMime,
  fileKind,
  downloadFileName,
} from './utils'

describe('utility helpers', () => {
  describe('shortHash', () => {
    it('returns empty string for empty input', () => {
      expect(shortHash('')).toBe('')
      expect(shortHash(null as any)).toBe('')
    })

    it('returns original string if it is short enough', () => {
      expect(shortHash('12345', 10, 6)).toBe('12345')
      expect(shortHash('0123456789abcdef0', 10, 6)).toBe('0123456789abcdef0') // 17 chars → no truncation
    })

    it('truncates hash with ellipsis', () => {
      const result = shortHash('0x1234567890abcdef1234567890', 4, 4)
      expect(result).toBe('0x12\u20267890')
    })

    it('handles different lead/tail values', () => {
      const result = shortHash('abcdefghijklmnop', 6, 3)
      expect(result).toBe('abcdef\u2026nop')
    })
  })

  describe('formatBytes', () => {
    it('handles empty and null values', () => {
      expect(formatBytes(null)).toBe('\u2014')
      expect(formatBytes(undefined)).toBe('\u2014')
      expect(formatBytes(NaN)).toBe('\u2014')
    })

    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(512)).toBe('512 B')
      expect(formatBytes(1024)).toBe('1.0 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(1048576)).toBe('1.0 MB')
      expect(formatBytes(1073741824)).toBe('1.0 GB')
    })
  })

  describe('classifyFlag', () => {
    it('classifies flag values case-insensitively', () => {
      expect(classifyFlag('LOW')).toBe('low')
      expect(classifyFlag('Low')).toBe('low')
      expect(classifyFlag('normal')).toBe('normal')
      expect(classifyFlag('HIGH')).toBe('high')
      expect(classifyFlag('High')).toBe('high')
    })

    it('returns unknown for invalid flags', () => {
      expect(classifyFlag('invalid')).toBe('unknown')
      expect(classifyFlag('')).toBe('unknown')
      expect(classifyFlag(null as any)).toBe('unknown')
    })
  })

  describe('extensionForMime', () => {
    it('returns empty string for unknown/empty MIME types', () => {
      expect(extensionForMime('')).toBe('')
      expect(extensionForMime(null)).toBe('')
      expect(extensionForMime('application/unknown')).toBe('')
    })

    it('returns dot extensions for known MIME types (case-insensitive)', () => {
      expect(extensionForMime('application/pdf')).toBe('.pdf')
      expect(extensionForMime('image/png')).toBe('.png')
      expect(extensionForMime('IMAGE/JPEG')).toBe('.jpg')
      expect(extensionForMime('text/plain')).toBe('.txt')
      expect(extensionForMime('text/markdown')).toBe('.md')
      expect(extensionForMime('application/json')).toBe('.json')
    })
  })

  describe('formatDate', () => {
    it('returns Undated for falsy input', () => {
      expect(formatDate(null)).toBe('Undated')
      expect(formatDate('')).toBe('Undated')
      expect(formatDate(undefined)).toBe('Undated')
    })

    it('returns the original string for unparseable dates', () => {
      expect(formatDate('not-a-date')).toBe('not-a-date')
    })

    it('formats valid ISO date strings', () => {
      const result = formatDate('2026-06-15')
      expect(result).toContain('Jun')
      expect(result).toContain('2026')
    })
  })

  describe('formatRelative', () => {
    it('returns empty string for falsy input', () => {
      expect(formatRelative(null)).toBe('')
      expect(formatRelative('')).toBe('')
    })

    it('returns empty string for unparseable dates', () => {
      expect(formatRelative('garbage')).toBe('')
    })

    it('returns just now for very recent times', () => {
      const now = new Date().toISOString()
      expect(formatRelative(now)).toBe('just now')
    })

    it('returns future-style label for future dates', () => {
      const future = new Date(Date.now() + 2 * 3600 * 1000).toISOString()
      expect(formatRelative(future)).toContain('in ')
      expect(formatRelative(future)).toContain('hour')
    })
  })

  describe('isTextLike', () => {
    it('returns true for undefined (legacy records)', () => {
      expect(isTextLike(undefined)).toBe(true)
      expect(isTextLike(null)).toBe(true)
    })

    it('returns true for text/ and application/json types', () => {
      expect(isTextLike('text/plain')).toBe(true)
      expect(isTextLike('text/csv')).toBe(true)
      expect(isTextLike('application/json')).toBe(true)
      expect(isTextLike('application/xml')).toBe(true)
    })

    it('returns false for binary types', () => {
      expect(isTextLike('application/pdf')).toBe(false)
      expect(isTextLike('image/png')).toBe(false)
      expect(isTextLike('application/octet-stream')).toBe(false)
    })
  })

  describe('isImageMime / isPdfMime', () => {
    it('detects image MIME types', () => {
      expect(isImageMime('image/png')).toBe(true)
      expect(isImageMime('IMAGE/JPEG')).toBe(true)
      expect(isImageMime('application/pdf')).toBe(false)
      expect(isImageMime(null)).toBe(false)
    })

    it('detects PDF MIME type', () => {
      expect(isPdfMime('application/pdf')).toBe(true)
      expect(isPdfMime('APPLICATION/PDF')).toBe(true)
      expect(isPdfMime('image/png')).toBe(false)
      expect(isPdfMime(null)).toBe(false)
    })
  })

  describe('fileKind', () => {
    it('categorizes MIME types correctly', () => {
      expect(fileKind('image/png')).toBe('image')
      expect(fileKind('application/pdf')).toBe('pdf')
      expect(fileKind('text/plain')).toBe('text')
      expect(fileKind('application/octet-stream')).toBe('binary')
      expect(fileKind(undefined)).toBe('text') // legacy
    })
  })

  describe('downloadFileName', () => {
    it('preserves original filename with extension', () => {
      expect(downloadFileName('Test', 'report.pdf', 'application/pdf')).toBe('report.pdf')
    })

    it('adds extension from MIME when filename has none', () => {
      expect(downloadFileName('Test', 'report', 'application/pdf')).toBe('report.pdf')
      expect(downloadFileName('Test', 'report', 'image/png')).toBe('report.png')
    })

    it('sanitizes special characters', () => {
      const name = downloadFileName('Test', 'my report!.pdf', null)
      expect(name).not.toContain('!')
    })

    it('builds from title when no filename provided', () => {
      const name = downloadFileName('Blood Test Results', null, 'application/pdf')
      expect(name).toContain('Blood_Test_Results')
      expect(name).toContain('.pdf')
    })

    it('falls back to .txt for unknown MIME', () => {
      expect(downloadFileName('Test', null, null)).toContain('.txt')
    })
  })
})
