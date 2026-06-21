import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shorten a 0G root hash / address for display: 0x1234…abcd */
export function shortHash(value: string, lead = 10, tail = 6): string {
  if (!value) return ''
  if (value.length <= lead + tail + 1) return value
  return `${value.slice(0, lead)}\u2026${value.slice(-tail)}`
}

export function formatDate(input: string | null | undefined): string {
  if (!input) return 'Undated'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Exact local date + time, e.g. "21 Jun 2026, 2:30 PM". */
export function formatDateTime(input: string | null | undefined): string {
  if (!input) return 'Unknown'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Relative time, e.g. "2 hours ago" / "in 3 days". */
export function formatRelative(input: string | null | undefined): string {
  if (!input) return ''
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const future = diffMs < 0
  const abs = Math.abs(diffMs) / 1000 // seconds
  const unit = (n: number, u: string) => {
    const r = Math.max(1, Math.round(n))
    const label = `${r} ${u}${r === 1 ? '' : 's'}`
    return future ? `in ${label}` : `${label} ago`
  }
  if (abs < 45) return future ? 'in a few seconds' : 'just now'
  if (abs < 90) return future ? 'in a minute' : 'a minute ago'
  if (abs < 3600) return unit(abs / 60, 'minute')
  if (abs < 86400) return unit(abs / 3600, 'hour')
  if (abs < 2592000) return unit(abs / 86400, 'day')
  if (abs < 31536000) return unit(abs / 2592000, 'month')
  return unit(abs / 31536000, 'year')
}

/** Combined "2 hours ago · 21 Jun 2026, 2:30 PM". */
export function formatTimeAgoExact(input: string | null | undefined): string {
  if (!input) return 'Unknown'
  const rel = formatRelative(input)
  const exact = formatDateTime(input)
  return rel ? `${rel} \u00b7 ${exact}` : exact
}

/** Human-readable byte size, e.g. "12.3 KB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '\u2014'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

export function classifyFlag(flag: string): 'low' | 'normal' | 'high' | 'unknown' {
  const f = (flag || '').toLowerCase()
  if (f === 'low' || f === 'high' || f === 'normal') return f
  return 'unknown'
}
