import {
  DOC_TYPES,
  EMPTY_EXTRACTION,
  type ExtractionResult,
  type LabFlag,
  type Severity,
} from '@/lib/og/types'

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

/** Coerce arbitrary model output into a valid ExtractionResult. */
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
    labResults: asArray<Record<string, unknown>>(o.labResults).map((l) => ({
      test: asString(l.test),
      value: asString(l.value),
      unit: asString(l.unit),
      referenceRange: asString(l.referenceRange),
      flag: asFlag(l.flag),
    })),
    allergies: asArray<unknown>(o.allergies).map((a) => asString(a)).filter(Boolean),
    remedies: asArray<unknown>(o.remedies).map((r) => asString(r)).filter(Boolean),
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
