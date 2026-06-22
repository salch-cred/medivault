import {
  DOC_TYPES,
  EMPTY_EXTRACTION,
  type ExtractionResult,
  type LabFlag,
  type Severity,
} from '@/lib/og/types'
import { parseNumeric, parseRange } from '@/lib/health'

function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  return String(v)
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function asFlag(v: unknown): LabFlag {
  const f = asString(v).toLowerCase()
  return f === 'low' || f === 'high' || f === 'normal' ? (f as LabFlag) : 'unknown'
}

function asSeverity(v: unknown): Severity {
  const s = asString(v).toLowerCase()
  return s === 'high' || s === 'medium' ? (s as Severity) : 'low'
}

// When the model leaves a lab flag as 'unknown' (or invalid), derive it by
// comparing the numeric value against the parsed reference range. This keeps the
// high/low/normal chips and the trend charts accurate even when the source
// document did not print an explicit H/L marker. We only ever OVERRIDE an
// unknown flag -- an explicit low/normal/high from the model is respected.
function resolveFlag(value: string, referenceRange: string, current: LabFlag): LabFlag {
  if (current === 'low' || current === 'high' || current === 'normal') return current
  const num = parseNumeric(value)
  if (num === null) return current
  const { low, high } = parseRange(referenceRange)
  if (low === undefined && high === undefined) return current
  if (low !== undefined && num < low) return 'low'
  if (high !== undefined && num > high) return 'high'
  return 'normal'
}

// Coerce arbitrary model output into a valid ExtractionResult so the UI never
// has to defend against missing/garbage fields.
export function normalizeExtraction(input: unknown): ExtractionResult {
  const o = (input ?? {}) as Record<string, unknown>
  const docTypeRaw = asString(o.docType, 'other') as ExtractionResult['docType']
  const docType = DOC_TYPES.includes(docTypeRaw) ? docTypeRaw : 'other'
  const confidenceRaw = typeof o.confidence === 'number' ? o.confidence : 0
  return {
    ...EMPTY_EXTRACTION,
    title: asString(o.title, 'Untitled record') || 'Untitled record',
    docType,
    date: o.date == null ? null : asString(o.date),
    plainLanguageSummary: asString(o.plainLanguageSummary),
    conditions: asArray<Record<string, unknown>>(o.conditions).map((c) => ({
      name: asString(c.name),
      status: asString(c.status),
      note: asString(c.note),
    })),
    medications: asArray<Record<string, unknown>>(o.medications).map((m) => ({
      name: asString(m.name),
      dose: asString(m.dose),
      frequency: asString(m.frequency),
      purpose: asString(m.purpose),
    })),
    labResults: asArray<Record<string, unknown>>(o.labResults)
      .map((l) => {
        const test = asString(l.test).trim()
        const value = asString(l.value).trim()
        const unit = asString(l.unit).trim()
        const referenceRange = asString(l.referenceRange).trim()
        return {
          test,
          value,
          unit,
          referenceRange,
          flag: resolveFlag(value, referenceRange, asFlag(l.flag)),
        }
      })
      .filter((l) => l.test !== '' || l.value !== ''),
    allergies: asArray<unknown>(o.allergies)
      .map((a) => asString(a).trim())
      .filter(Boolean),
    remedies: asArray<unknown>(o.remedies)
      .map((r) => asString(r).trim())
      .filter(Boolean),
    followUps: asArray<Record<string, unknown>>(o.followUps).map((f) => ({
      action: asString(f.action),
      byDate: f.byDate == null ? null : asString(f.byDate),
      priority: asSeverity(f.priority),
    })),
    redFlags: asArray<Record<string, unknown>>(o.redFlags).map((r) => ({
      issue: asString(r.issue),
      severity: asSeverity(r.severity),
      suggestion: asString(r.suggestion),
    })),
    confidence: Math.max(0, Math.min(1, confidenceRaw)),
    sourceQuotes: asArray<Record<string, unknown>>(o.sourceQuotes).map((s) => ({
      quote: asString(s.quote),
      supports: asString(s.supports),
    })),
  }
}
