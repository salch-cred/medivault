import { describe, it, expect } from 'vitest'
import {
  parseNumeric,
  parseRange,
  collectLabSeries,
  upcomingFollowUps,
  timelineEvents,
  buildEmergencyProfile,
} from './health'
import type { VaultRecord, ExtractionResult } from '@/lib/og/types'

// ── Factory helpers ───────────────────────────────────────

function makeRecord(
  id: string,
  date: string,
  summary: Partial<ExtractionResult> = {},
  metaOverrides: Record<string, unknown> = {},
): VaultRecord {
  return {
    meta: {
      id,
      owner: '0x123',
      title: `Record ${id}`,
      docType: 'lab_report',
      date,
      rootHash: `0x${id}`,
      createdAt: date,
      ...(metaOverrides as object),
    },
    summary: {
      ...({
        title: `Record ${id}`,
        docType: 'lab_report' as const,
        date,
        plainLanguageSummary: '',
        conditions: [],
        medications: [],
        labResults: [],
        allergies: [],
        remedies: [],
        followUps: [],
        redFlags: [],
        confidence: 0.9,
        sourceQuotes: [],
      } as ExtractionResult),
      ...summary,
    },
  }
}

// ── Tests ──────────────────────────────────────────────────

describe('health utilities', () => {
  describe('parseNumeric', () => {
    it('handles empty and null values', () => {
      expect(parseNumeric('')).toBeNull()
      expect(parseNumeric(null as any)).toBeNull()
      expect(parseNumeric(undefined as any)).toBeNull()
    })

    it('extracts numbers from strings', () => {
      expect(parseNumeric('123')).toBe(123)
      expect(parseNumeric('12.3')).toBe(12.3)
      expect(parseNumeric('12,345.67')).toBe(12345.67)
      expect(parseNumeric('value is -5.6 mg/dL')).toBe(-5.6)
      expect(parseNumeric('<150')).toBe(150)
      expect(parseNumeric('≥5.5')).toBe(5.5)
    })

    it('returns null for strings with no digits', () => {
      expect(parseNumeric('normal')).toBeNull()
      expect(parseNumeric('N/A')).toBeNull()
    })
  })

  describe('parseRange', () => {
    it('handles empty range', () => {
      expect(parseRange('')).toEqual({})
    })

    it('handles range with regular dash', () => {
      expect(parseRange('10 - 20')).toEqual({ low: 10, high: 20 })
    })

    it('handles range with en-dash (U+2013)', () => {
      expect(parseRange('10 \u2013 20')).toEqual({ low: 10, high: 20 })
    })

    it('handles range with em-dash (U+2014)', () => {
      expect(parseRange('10 \u2014 20')).toEqual({ low: 10, high: 20 })
    })

    it('handles range with the word "to"', () => {
      expect(parseRange('10 to 20')).toEqual({ low: 10, high: 20 })
    })

    it('handles less than range', () => {
      expect(parseRange('< 150')).toEqual({ high: 150 })
      expect(parseRange('\u2264 150')).toEqual({ high: 150 }) // ≤
    })

    it('handles greater than range', () => {
      expect(parseRange('> 5.5')).toEqual({ low: 5.5 })
      expect(parseRange('\u2265 5.5')).toEqual({ low: 5.5 }) // ≥
    })

    it('handles decimal ranges', () => {
      expect(parseRange('3.5 - 5.5')).toEqual({ low: 3.5, high: 5.5 })
    })

    it('handles ranges with commas in numbers', () => {
      expect(parseRange('1,000 - 2,000')).toEqual({ low: 1000, high: 2000 })
    })
  })

  describe('collectLabSeries', () => {
    it('groups and sorts points correctly', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          labResults: [
            { test: 'Hb', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
          ],
        }),
        makeRecord('2', '2026-06-02', {
          labResults: [
            { test: 'Hb', value: '13.8', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
          ],
        }),
      ]
      const series = collectLabSeries(records)
      expect(series).toHaveLength(1)
      expect(series[0].test).toBe('Hb')
      expect(series[0].points).toHaveLength(2)
      expect(series[0].points[0].value).toBe(14.2) // ascending date
      expect(series[0].points[1].value).toBe(13.8)
    })

    it('separates different lab tests', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          labResults: [
            { test: 'Hb', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
            { test: 'WBC', value: '7.5', unit: '10^3/uL', referenceRange: '4-11', flag: 'normal' },
          ],
        }),
      ]
      const series = collectLabSeries(records)
      expect(series).toHaveLength(2)
    })

    it('skips non-numeric lab values', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          labResults: [
            { test: 'Note', value: 'within range', unit: '', referenceRange: '', flag: 'normal' },
          ],
        }),
      ]
      const series = collectLabSeries(records)
      expect(series).toHaveLength(0)
    })

    it('merges reference ranges across records', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          labResults: [
            { test: 'Hb', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
          ],
        }),
        makeRecord('2', '2026-06-02', {
          labResults: [
            { test: 'Hb', value: '13.8', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
          ],
        }),
      ]
      const series = collectLabSeries(records)
      expect(series[0].low).toBe(12)
      expect(series[0].high).toBe(16)
    })

    it('handles records with no summary', () => {
      const records: VaultRecord[] = [
        { meta: makeRecord('1', '2026-06-01').meta },
      ]
      const series = collectLabSeries(records)
      expect(series).toHaveLength(0)
    })
  })

  describe('upcomingFollowUps', () => {
    it('collects and sorts follow-ups by date', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          followUps: [
            { action: 'Recheck HbA1c', byDate: '2026-09-01', priority: 'high' as const },
            { action: 'Eye exam', byDate: '2026-07-15', priority: 'medium' as const },
          ],
        }),
        makeRecord('2', '2026-06-02', {
          followUps: [
            { action: 'Lifestyle counseling', byDate: null, priority: 'low' as const },
          ],
        }),
      ]
      const fu = upcomingFollowUps(records)
      expect(fu).toHaveLength(3)
      expect(fu[0].byDate).toBe('2026-07-15') // earliest date first
      expect(fu[1].byDate).toBe('2026-09-01')
      expect(fu[2].byDate).toBeNull() // no-date last
    })

    it('sorts no-date items by priority', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          followUps: [
            { action: 'Low priority', byDate: null, priority: 'low' as const },
            { action: 'High priority', byDate: null, priority: 'high' as const },
          ],
        }),
      ]
      const fu = upcomingFollowUps(records)
      expect(fu[0].priority).toBe('high')
      expect(fu[1].priority).toBe('low')
    })
  })

  describe('timelineEvents', () => {
    it('sorts by date descending (newest first)', () => {
      const records: VaultRecord[] = [
        makeRecord('old', '2026-01-01'),
        makeRecord('new', '2026-06-15'),
        makeRecord('mid', '2026-03-01'),
      ]
      const events = timelineEvents(records)
      expect(events[0].date).toBe('2026-06-15')
      expect(events[1].date).toBe('2026-03-01')
      expect(events[2].date).toBe('2026-01-01')
    })

    it('falls back to meta date when summary date is null', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', { date: null }),
      ]
      const events = timelineEvents(records)
      expect(events[0].date).toBe('2026-06-01')
    })

    it('sorts undated records to the end', () => {
      const records: VaultRecord[] = [
        makeRecord('dated', '2026-06-01'),
        makeRecord('undated', null as any, {}, { date: null }),
      ]
      const events = timelineEvents(records)
      expect(events[0].date).toBe('2026-06-01')
      expect(events[1].date).toBeNull()
    })
  })

  describe('buildEmergencyProfile', () => {
    it('collects unique allergies, medications, and conditions', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          allergies: ['Penicillin', 'Sulfa'],
          medications: [{ name: 'Metformin', dose: '500mg', frequency: 'Daily', purpose: 'Blood sugar' }],
          conditions: [{ name: 'Pre-diabetes', status: 'Active', note: '' }],
        }),
        makeRecord('2', '2026-06-02', {
          allergies: ['Penicillin'], // duplicate
          medications: [{ name: 'Lisinopril', dose: '10mg', frequency: 'Daily', purpose: 'BP' }],
          conditions: [{ name: 'Hypertension', status: 'Active', note: '' }],
        }),
      ]
      const profile = buildEmergencyProfile(records)
      expect(profile.allergies).toHaveLength(2) // deduplicated
      expect(profile.allergies).toContain('Penicillin')
      expect(profile.allergies).toContain('Sulfa')
      expect(profile.medications).toHaveLength(2)
      expect(profile.conditions).toHaveLength(2)
    })

    it('handles records with no summary', () => {
      const records: VaultRecord[] = [{ meta: makeRecord('1', '2026-06-01').meta }]
      const profile = buildEmergencyProfile(records)
      expect(profile.allergies).toEqual([])
      expect(profile.medications).toEqual([])
      expect(profile.conditions).toEqual([])
    })

    it('does not add empty or whitespace-only allergy strings', () => {
      const records: VaultRecord[] = [
        makeRecord('1', '2026-06-01', {
          allergies: ['', '  ', 'Penicillin'],
        }),
      ]
      const profile = buildEmergencyProfile(records)
      expect(profile.allergies).toEqual(['Penicillin'])
    })
  })
})
