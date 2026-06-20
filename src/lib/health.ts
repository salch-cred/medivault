import type {
  Condition,
  LabFlag,
  Medication,
  Severity,
  VaultRecord,
} from '@/lib/og/types'

export function parseNumeric(value: string): number | null {
  if (!value) return null
  const m = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

export function parseRange(range: string): { low?: number; high?: number } {
  if (!range) return {}
  const cleaned = range.replace(/,/g, '')
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-\u2013\u2014to]+\s*(-?\d+(?:\.\d+)?)/i)
  if (between) return { low: parseFloat(between[1]), high: parseFloat(between[2]) }
  const lt = cleaned.match(/[<\u2264]\s*(-?\d+(?:\.\d+)?)/)
  if (lt) return { high: parseFloat(lt[1]) }
  const gt = cleaned.match(/[>\u2265]\s*(-?\d+(?:\.\d+)?)/)
  if (gt) return { low: parseFloat(gt[1]) }
  return {}
}

export type LabPoint = {
  date: string | null
  value: number
  raw: string
  unit: string
  referenceRange: string
  flag: LabFlag
  recordId: string
  title: string
}

export type LabSeries = {
  test: string
  unit: string
  low?: number
  high?: number
  points: LabPoint[]
}

export function collectLabSeries(records: VaultRecord[]): LabSeries[] {
  const map = new Map<string, LabSeries>()
  for (const r of records) {
    const s = r.summary
    if (!s) continue
    for (const lab of s.labResults) {
      const num = parseNumeric(lab.value)
      if (num === null) continue
      const key = lab.test.trim().toLowerCase()
      if (!key) continue
      const range = parseRange(lab.referenceRange)
      if (!map.has(key)) {
        map.set(key, { test: lab.test, unit: lab.unit, low: range.low, high: range.high, points: [] })
      }
      const series = map.get(key)!
      if (series.low === undefined && range.low !== undefined) series.low = range.low
      if (series.high === undefined && range.high !== undefined) series.high = range.high
      series.points.push({
        date: s.date ?? r.meta.date,
        value: num,
        raw: lab.value,
        unit: lab.unit,
        referenceRange: lab.referenceRange,
        flag: lab.flag,
        recordId: r.meta.id,
        title: s.title || r.meta.title,
      })
    }
  }
  for (const s of map.values()) {
    s.points.sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1))
  }
  return [...map.values()]
    .filter((s) => s.points.length > 0)
    .sort((a, b) => b.points.length - a.points.length)
}

export type UpcomingFollowUp = {
  recordId: string
  recordTitle: string
  action: string
  byDate: string | null
  priority: Severity
}

export function upcomingFollowUps(records: VaultRecord[]): UpcomingFollowUp[] {
  const out: UpcomingFollowUp[] = []
  for (const r of records) {
    if (!r.summary) continue
    for (const f of r.summary.followUps) {
      out.push({
        recordId: r.meta.id,
        recordTitle: r.summary.title || r.meta.title,
        action: f.action,
        byDate: f.byDate,
        priority: f.priority,
      })
    }
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => {
    if (a.byDate && b.byDate) return a.byDate < b.byDate ? -1 : 1
    if (a.byDate) return -1
    if (b.byDate) return 1
    return rank[a.priority] - rank[b.priority]
  })
}

export type TimelineEvent = {
  recordId: string
  date: string | null
  title: string
  docType: VaultRecord['meta']['docType']
  summary: string
  redFlagCount: number
}

export function timelineEvents(records: VaultRecord[]): TimelineEvent[] {
  return records
    .map((r) => ({
      recordId: r.meta.id,
      date: r.summary?.date ?? r.meta.date,
      title: r.summary?.title || r.meta.title,
      docType: r.meta.docType,
      summary: r.summary?.plainLanguageSummary ?? '',
      redFlagCount: r.summary?.redFlags.length ?? 0,
    }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? 1 : -1
      if (a.date) return -1
      if (b.date) return 1
      return 0
    })
}

export type EmergencyProfile = {
  allergies: string[]
  medications: Medication[]
  conditions: Condition[]
}

export function buildEmergencyProfile(records: VaultRecord[]): EmergencyProfile {
  const allergies = new Set<string>()
  const medsByName = new Map<string, Medication>()
  const condByName = new Map<string, Condition>()
  // Iterate newest first so the most recent details win.
  const ordered = [...records].sort((a, b) =>
    a.meta.createdAt < b.meta.createdAt ? 1 : -1,
  )
  for (const r of ordered) {
    if (!r.summary) continue
    r.summary.allergies.forEach((a) => a && allergies.add(a.trim()))
    for (const m of r.summary.medications) {
      const key = m.name.trim().toLowerCase()
      if (key && !medsByName.has(key)) medsByName.set(key, m)
    }
    for (const c of r.summary.conditions) {
      const key = c.name.trim().toLowerCase()
      if (key && !condByName.has(key)) condByName.set(key, c)
    }
  }
  return {
    allergies: [...allergies],
    medications: [...medsByName.values()],
    conditions: [...condByName.values()],
  }
}
