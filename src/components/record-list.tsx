'use client'

import { FileX2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { RecordCard } from '@/components/record-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useVault } from '@/lib/store'
import { staggerContainer, staggerItem } from '@/lib/motion'

const containerVariants = staggerContainer(0.07, 0.04)
const itemVariants = staggerItem

export function RecordList() {
  const { records, loadingRecords } = useVault()

  if (loadingRecords && records.length === 0) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <FileX2 className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">No records yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Upload your first lab report, prescription, or discharge summary above. It’s
          encrypted on your device before anything touches 0G.
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
      {records.map((meta) => (
        <motion.div key={meta.id} variants={itemVariants}>
          <RecordCard meta={meta} />
        </motion.div>
      ))}
    </motion.div>
  )
}
