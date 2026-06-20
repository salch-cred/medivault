'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronRight, FileSpreadsheet, User2 } from 'lucide-react'
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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-8 text-center bg-card/20">
        <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No shared documents received yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          When family, friends, or doctors share their E2E encrypted medical files with your wallet address, they will appear here.
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
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-[15px] font-semibold leading-tight md:text-base">
                        {record.title}
                      </h3>
                      <Badge variant="outline" className="shrink-0 text-xs gap-1 border-neutral-700">
                        <User2 className="h-3 w-3" /> Shared by: {record.senderName}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Document Date: {formatDate(record.date)} · Shared: {formatDate(record.sharedAt)}
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                      Sender Address: {shortHash(record.senderAddress)}
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
