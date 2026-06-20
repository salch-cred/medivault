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

export function classifyFlag(flag: string): 'low' | 'normal' | 'high' | 'unknown' {
  const f = (flag || '').toLowerCase()
  if (f === 'low' || f === 'high' || f === 'normal') return f
  return 'unknown'
}
