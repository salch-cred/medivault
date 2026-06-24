import { describe, it, expect } from 'vitest'
import { normalizeExtraction } from './normalize'
import { EMPTY_EXTRACTION } from '@/lib/og/types'

describe('normalizeExtraction', () => {
  it('returns EMPTY_EXTRACTION for null/undefined input', () => {
    const result = normalizeExtraction(null)
    expect(result.title).toBe('Untitled record')
    expect(result.conditions).toEqual([])
    expect(result.labResults).toEqual([])
    expect(result.confidence).toBe(0)
  })

  it('returns EMPTY_EXTRACTION for empty object', () => {
    const result = normalizeExtraction({})
    expect(result.title).toBe('Untitled record')
    expect(result.docType).toBe('other')
    expect(result.date).toBeNull()
  })

  it('coerces string fields correctly', () => {
    const result = normalizeExtraction({
      title: 'Lab Report',
      docType: 'lab_report',
      date: '2026-06-15',
      plainLanguageSummary: 'Your blood test looks good.',
    })
    expect(result.title).toBe('Lab Report')
    expect(result.docType).toBe('lab_report')
    expect(result.date).toBe('2026-06-15')
    expect(result.plainLanguageSummary).toBe('Your blood test looks good.')
  })

  it('normalizes invalid docType to "other"', () => {
    expect(normalizeExtraction({ docType: 'invalid_type' }).docType).toBe('other')
    expect(normalizeExtraction({ docType: 123 }).docType).toBe('other')
    expect(normalizeExtraction({ docType: null }).docType).toBe('other')
  })

  it('clamps confidence to [0, 1]', () => {
    expect(normalizeExtraction({ confidence: 1.5 }).confidence).toBe(1)
    expect(normalizeExtraction({ confidence: -0.5 }).confidence).toBe(0)
    expect(normalizeExtraction({ confidence: 0.95 }).confidence).toBe(0.95)
    expect(normalizeExtraction({ confidence: 'high' }).confidence).toBe(0)
    expect(normalizeExtraction({ confidence: null }).confidence).toBe(0)
  })

  it('filters out empty lab results', () => {
    const result = normalizeExtraction({
      labResults: [
        { test: 'Hb', value: '14.2', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
        { test: '', value: '', unit: '', referenceRange: '', flag: 'unknown' }, // filtered
        { test: 'WBC', value: '', unit: '', referenceRange: '', flag: 'unknown' }, // kept (has test)
      ],
    })
    expect(result.labResults).toHaveLength(2)
    expect(result.labResults[0].test).toBe('Hb')
    expect(result.labResults[1].test).toBe('WBC')
  })

  it('resolves unknown flags by comparing value to reference range', () => {
    const result = normalizeExtraction({
      labResults: [
        { test: 'Hb', value: '10.0', unit: 'g/dL', referenceRange: '12-16', flag: 'unknown' },
      ],
    })
    expect(result.labResults[0].flag).toBe('low') // 10 < 12
  })

  it('resolves unknown flags as high when above range', () => {
    const result = normalizeExtraction({
      labResults: [
        { test: 'Glucose', value: '250', unit: 'mg/dL', referenceRange: '< 200', flag: 'unknown' },
      ],
    })
    expect(result.labResults[0].flag).toBe('high')
  })

  it('resolves unknown flags as normal when within range', () => {
    const result = normalizeExtraction({
      labResults: [
        { test: 'Hb', value: '14.0', unit: 'g/dL', referenceRange: '12-16', flag: 'unknown' },
      ],
    })
    expect(result.labResults[0].flag).toBe('normal')
  })

  it('never overrides an explicit flag', () => {
    const result = normalizeExtraction({
      labResults: [
        { test: 'Hb', value: '10.0', unit: 'g/dL', referenceRange: '12-16', flag: 'normal' },
      ],
    })
    expect(result.labResults[0].flag).toBe('normal') // explicit flag respected
  })

  it('coerces conditions array', () => {
    const result = normalizeExtraction({
      conditions: [
        { name: 'Diabetes', status: 'Active', note: 'Type 2' },
        { name: 'Hypertension', status: 'Resolved', note: '' },
      ],
    })
    expect(result.conditions).toHaveLength(2)
    expect(result.conditions[0].name).toBe('Diabetes')
  })

  it('handles non-array conditions gracefully', () => {
    const result = normalizeExtraction({ conditions: 'not an array' })
    expect(result.conditions).toEqual([])
  })

  it('coerces medications', () => {
    const result = normalizeExtraction({
      medications: [
        { name: 'Metformin', dose: '500mg', frequency: 'Daily', purpose: 'Blood sugar' },
      ],
    })
    expect(result.medications).toHaveLength(1)
    expect(result.medications[0].name).toBe('Metformin')
  })

  it('filters empty/whitespace allergies and remedies', () => {
    const result = normalizeExtraction({
      allergies: ['Penicillin', '', '  ', 'Sulfa'],
      remedies: ['Rest', '', 'Hydration'],
    })
    expect(result.allergies).toEqual(['Penicillin', 'Sulfa'])
    expect(result.remedies).toEqual(['Rest', 'Hydration'])
  })

  it('coerces followUps with severity', () => {
    const result = normalizeExtraction({
      followUps: [
        { action: 'Recheck in 3 months', byDate: '2026-09-01', priority: 'high' },
        { action: 'No follow-up needed', byDate: null, priority: 'invalid' }, // → low
      ],
    })
    expect(result.followUps).toHaveLength(2)
    expect(result.followUps[0].priority).toBe('high')
    expect(result.followUps[1].priority).toBe('low') // invalid → low
  })

  it('coerces redFlags', () => {
    const result = normalizeExtraction({
      redFlags: [
        { issue: 'High glucose', severity: 'high', suggestion: 'See doctor' },
        { issue: 'Low iron', severity: 'medium', suggestion: 'Supplement' },
      ],
    })
    expect(result.redFlags).toHaveLength(2)
    expect(result.redFlags[0].issue).toBe('High glucose')
  })

  it('coerces sourceQuotes', () => {
    const result = normalizeExtraction({
      sourceQuotes: [
        { quote: 'HbA1c: 5.8%', supports: 'Pre-diabetes indicator' },
      ],
    })
    expect(result.sourceQuotes).toHaveLength(1)
    expect(result.sourceQuotes[0].quote).toBe('HbA1c: 5.8%')
  })

  it('handles date as null', () => {
    const result = normalizeExtraction({ date: null })
    expect(result.date).toBeNull()
  })

  it('coerces date numbers to strings', () => {
    const result = normalizeExtraction({ date: 20260615 })
    expect(result.date).toBe('20260615')
  })

  it('spreads EMPTY_EXTRACTION so all fields exist', () => {
    const result = normalizeExtraction({ title: 'Test' })
    expect(result).toMatchObject({
      conditions: [],
      medications: [],
      labResults: [],
      allergies: [],
      remedies: [],
      followUps: [],
      redFlags: [],
      sourceQuotes: [],
    })
  })
})
