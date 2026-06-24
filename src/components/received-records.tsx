'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronRight, Inbox, User2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DocTypeIcon } from '@/components/doc-type-icon'
import { Badge } from '@/components/ui/badge'
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import { formatDate, shortHash } from '@/lib/utils'
import { useVault } from '@/lib/store'
import { pressable, spring, staggerContainer, staggerItem } from '@/lib/motion'

const containerVariants = staggerContainer(0.07, 0.04)
const itemVariants = staggerItem

export function ReceivedRecords() {
  const { receivedRecords } = useVault()

  if (receivedRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center bg-card/20">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Inbox className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm font-semibold">No shared documents yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          When family, friends, or doctors share their E2E-encrypted medical files with your wallet address, they will appear here.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid gap-3"
    >
      {receivedRecords.map((record) => (
        <motion.div key={record.id} variants={itemVariants}>
          <motion.div
            variants={pressable}
            initial="rest"
            whileHover="hover"
            whileTap="tap"
            transition={spring}
          >
            <Link
              href={`/vault/shared/record/${record.rootHash}?senderName=${encodeURIComponent(record.senderName)}&senderAddress=${encodeURIComponent(record.senderAddress)}`}
              className="block"
            >
              <Card className="transition-shadow hover:shadow-md active:shadow-sm">
                <CardContent className="flex min-h-[64px] items-center gap-3 p-4">
                  <DocTypeIcon type={record.docType} withTone />
                  <div className="min-w-0 flex-1">
                    {/* Title + doc-type badge — badge wraps below title on small screens */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight md:text-base">
                        {record.title}
                      </h3>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {(DOC_TYPE_LABELS as Record<string, string>)[record.docType] || record.docType}
                      </Badge>
                    </div>
                    {/* Sender row */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User2 className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{record.senderName}</span>
                      </span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="font-mono">{shortHash(record.senderAddress)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Doc: {formatDate(record.date)} &middot; Received: {formatDate(record.sharedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  )
}
