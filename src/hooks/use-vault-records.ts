'use client'

import { useEffect } from 'react'
import { useVault } from '@/lib/store'
import type { VaultRecord } from '@/lib/og/types'

/** Hydrates (decrypts) summaries for all records and returns combined VaultRecords. */
export function useVaultRecords(): VaultRecord[] {
  const { records, summaries, loadSummary } = useVault()

  useEffect(() => {
    // Load summaries with limited concurrency (3 at a time) to avoid
    // flooding the 0G indexer with simultaneous "Getting file locations"
    // requests for every record at once.
    const pending = records.filter(
      (meta) => !summaries[meta.id] && meta.summaryRootHash
    )
    const CONCURRENCY = 3
    let idx = 0
    const runNext = (): void => {
      if (idx >= pending.length) return
      const meta = pending[idx++]
      void loadSummary(meta).finally(runNext)
    }
    for (let i = 0; i < Math.min(CONCURRENCY, pending.length); i++) {
      runNext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  return records.map((meta) => ({ meta, summary: summaries[meta.id] }))
}
