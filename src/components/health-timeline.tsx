'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { DocTypeIcon } from '@/components/doc-type-icon'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { timelineEvents } from '@/lib/health'
import type { VaultRecord } from '@/lib/og/types'

export function HealthTimeline({ records }: { records: VaultRecord[] }) {
  const events = timelineEvents(records)
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Your timeline appears once you add records.</p>
  }
  return (
    <ol className="relative ml-3 border-l border-border">
      {events.map((e) => (
        <li key={e.recordId} className="mb-6 ml-6">
          <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-background ring-4 ring-background">
            <DocTypeIcon type={e.docType} className="h-4 w-4" />
          </span>
          <Link href={`/vault/record/${e.recordId}`} className="group">
            <div className="flex flex-wrap items-center gap-2">
              <time className="text-xs font-medium text-muted-foreground">{formatDate(e.date)}</time>
              {e.redFlagCount > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {e.redFlagCount} flag{e.redFlagCount > 1 ? 's' : ''}
                </Badge>
              ) : null}
            </div>
            <h3 className="font-medium group-hover:underline">{e.title}</h3>
            {e.summary ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{e.summary}</p>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  )
}
