'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DocTypeIcon } from '@/components/doc-type-icon'
import { EncryptedBadge } from '@/components/encrypted-badge'
import { Badge } from '@/components/ui/badge'
import { DOC_TYPE_LABELS, type RecordMeta } from '@/lib/og/types'
import { formatDate } from '@/lib/utils'
import { pressable, spring } from '@/lib/motion'

export function RecordCard({ meta }: { meta: RecordMeta }) {
  return (
    <motion.div
      variants={pressable}
      initial="rest"
      whileHover="hover"
      // whileTap gives the tactile press; min target height keeps it thumb-friendly.
      whileTap="tap"
      transition={spring}
    >
      <Link
        href={`/vault/record/${meta.id}`}
        className="block"
        aria-label={`${meta.title}, ${DOC_TYPE_LABELS[meta.docType]}, ${formatDate(meta.date)}`}
      >
        <Card className="transition-shadow hover:shadow-md active:shadow-sm">
          {/* min-h-[64px] guarantees a comfortable >44px tap target on mobile. */}
          <CardContent className="flex min-h-[64px] items-center gap-3 p-4">
            <DocTypeIcon type={meta.docType} withTone />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-[15px] font-semibold leading-tight md:text-base">
                  {meta.title}
                </h3>
                {/* Hide the type badge on very small screens to keep the title
                    legible; the doc-type icon already conveys it. */}
                <Badge variant="secondary" className="shrink-0 hidden sm:inline-flex">
                  {DOC_TYPE_LABELS[meta.docType]}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(meta.date)}</p>
              <div className="mt-2">
                <EncryptedBadge rootHash={meta.rootHash} />
              </div>
            </div>
            {/* Disclosure chevron = "tappable row", a Mobbin/iOS convention. */}
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}
