import { FlaskConical, Pill, FileText, ScanLine, File } from 'lucide-react'
import type { DocType } from '@/lib/og/types'
import { cn } from '@/lib/utils'

const MAP: Record<DocType, typeof File> = {
  lab_report: FlaskConical,
  prescription: Pill,
  discharge_summary: FileText,
  imaging: ScanLine,
  other: File,
}

const TONE: Record<DocType, string> = {
  lab_report: 'text-sky-600 bg-sky-50',
  prescription: 'text-violet-600 bg-violet-50',
  discharge_summary: 'text-emerald-600 bg-emerald-50',
  imaging: 'text-amber-600 bg-amber-50',
  other: 'text-slate-600 bg-slate-100',
}

export function DocTypeIcon({
  type,
  className,
  withTone = false,
}: {
  type: DocType
  className?: string
  withTone?: boolean
}) {
  const Icon = MAP[type] ?? File
  if (withTone) {
    return (
      <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl', TONE[type])}>
        <Icon className={cn('h-5 w-5', className)} />
      </span>
    )
  }
  return <Icon className={cn('h-5 w-5', className)} />
}
