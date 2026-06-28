'use client'

import { ConnectGate } from '@/components/connect-gate'
import { LabTrends } from '@/components/lab-trends'
import { useVaultRecords } from '@/hooks/use-vault-records'

export default function TrendsPage() {
  return (
    <ConnectGate>
      <TrendsInner />
    </ConnectGate>
  )
}

function TrendsInner() {
  const records = useVaultRecords()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lab trends</h1>
        <p className="text-sm text-muted-foreground">
          The same test across your reports, plotted against its reference range.
        </p>
      </div>
      <LabTrends records={records} />
    </div>
  )
}
