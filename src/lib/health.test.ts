import { describe, it, expect } from 'vitest'
import {
  parseNumeric,
  parseRange,
  collectLabSeries,
  upcomingFollowUps,
  timelineEvents,
  buildEmergencyProfile,
} from './health'
import type { VaultRecord } from '@/lib/og/types'

describe('health utilities', () => {
  describe('parseNumeric', () => {
    it('handles empty and null values', () => {
      expect(parseNumeric('')).toBeNull()
      expect(parseNumeric(null as any)).toBeNull()
    })

    it('extracts numbers from strings', () => {
      expect(parseNumeric('123')).toBe(123)
      expect(parseNumeric('12.3')).toBe(12.3)
      expect(parseNumeric('12,345.67')).toBe(12345.67)
      expect(parseNumeric('value is -5.6 mg/dL')).toBe(-5.6)
    })
  })

  describe('parseRange', () => {
    it('handles empty range', () => {
      expect(parseRange('')).toEqual({})
    })

    it('handles range with dash', () => {
      expect(parseRange('10 - 20')).toEqual({ low: 10, high: 20 })
      expect(parseRange('10 – 20')).toEqual({ low: 10, high: 20 }) // en-dash
    })

    it('handles less than range', () => {
      expect(parseRange('< 150')).toEqual({ high: 150 })
      expect(parseRange('≤ 150')).toEqual({ high: 150 })
    })

    it('handles greater than range', () => {
      expect(parseRange('> 5.5')).toEqual({ low: 5.5 })
      expect(parseRange('≥ 5.5')).toEqual({ low: 5.5 })
    })
  })

  describe('collectLabSeries', () => {
    it('groups and sorts points correctly', () => {
      const records: VaultRecord[] = [
        {
          meta: {
            id: '1',
            owner: '0x123',
            title: 'Report 1',
            docType: 'lab_report',
            date: '2026-06-01',
            rootHash: '0xabc',
            createdAt: '2026-06-01',
          },
          summary: {
            title: 'Report 1',
            docType: 'lab_report',
            date: '2026-06-01',
            plainLanguageSummary: '',
            conditions: [],
            medications: [],
            labResults: [
              { test: 'hb', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
            ],
            allergies: [],
            remedies: [],
            followUps: [],
            redFlags: [],
            confidence: 0.95,
            sourceQuotes: [],
          },
        },
        {
          meta: {
            id: '2',
            owner: '0x123',
            title: 'Report 2',
            docType: 'lab_report',
            date: '2026-06-02',
            rootHash: '0xdef',
            createdAt: '2026-06-02',
          },
          summary: {
            title: 'Report 2',
            docType: 'lab_report',
            date: '2026-06-02',
            plainLanguageSummary: '',
            conditions: [],
            medications: [],
            labResults: [
              { test: 'hb', value: '13.8', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
            ],
            allergies: [],
            remedies: [],
            followUps: [],
            redFlags: [],
            confidence: 0.95,
            sourceQuotes: [],
          },
        },
      ]

      const series = collectLabSeries(records)
      expect(series).toHaveLength(1)
      expect(series[0].test).toBe('hb')
      expect(series[0].points).toHaveLength(2)
      // Sorted by date ascending
      expect(series[0].points[0].value).toBe(14.2)
      expect(series[0].points[1].value).toBe(13.8)
    })
  })
})
