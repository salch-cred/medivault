'use client'

import { useEffect, useRef } from 'react'
import { FileX2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { RecordCard } from '@/components/record-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useVault } from '@/lib/store'
import { staggerContainer, staggerItem } from '@/lib/motion'

const containerVariants = staggerContainer(0.07, 0.04)
const itemVariants = staggerItem

// How many recent records to warm ahead of time. Summaries are tiny and are
// cached in encrypted localStorage after the first fetch, so this mainly pays
// off on the very first visit of a session.
const PREFETCH_LIMIT = 12

export function RecordList() {
  const { records, loadingRecords, summaries, failedSummaries, loadSummary, storage } = useVault()
  const prewarmedRef = useRef(false)

  // Predictive prefetch. Two cheap, best-effort warmups so the app feels
  // instant:
  //   1. prewarm() the 0G upload path once (warms edge proxies + the indexer's
  //      sharded-node cache), so the next upload's node selection is instant.
  //   2. Decrypt the most recent records' AI summaries in the background, so
  //      opening a record renders immediately instead of showing a
  //      "Decrypting summary..." spinner.
  // loadSummary() already dedupes against the live store (returns cached, marks
  // failures), so re-runs are harmless.
  useEffect(() => {
    if (!storage) return
    if (!prewarmedRef.current) {
      prewarmedRef.current = true
      void storage.prewarm().catch(() => {})
    }
    let cancelled = false
    void (async () => {
      for (const meta of records.slice(0, PREFETCH_LIMIT)) {
        if (cancelled) return
        if (summaries[meta.id] || failedSummaries[meta.id]) continue
        try {
          await loadSummary(meta)
        } catch {
          // best-effort; the record page retries on open
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, storage])

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
