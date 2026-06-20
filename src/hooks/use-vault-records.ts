'use client'

import { useEffect } from 'react'
import { useVault } from '@/lib/store'
import type { VaultRecord } from '@/lib/og/types'

/** Hydrates (decrypts) summaries for all records and returns combined VaultRecords. */
export function useVaultRecords(): VaultRecord[] {
  const { records, summaries, loadSummary } = useVault()

  useEffect(() => {
    for (const meta of records) {
      if (!summaries[meta.id] && meta.summaryRootHash) {
        void loadSummary(meta)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  return records.map((meta) => ({ meta, summary: summaries[meta.id] }))
}
