'use client'

import { ConnectGate } from '@/components/connect-gate'
import { HealthTimeline } from '@/components/health-timeline'
import { Card, CardContent } from '@/components/ui/card'
import { useVaultRecords } from '@/hooks/use-vault-records'

export default function TimelinePage() {
  return (
    <ConnectGate>
      <TimelineInner />
    </ConnectGate>
  )
}

function TimelineInner() {
  const records = useVaultRecords()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Health timeline</h1>
        <p className="text-sm text-muted-foreground">Your records in chronological order.</p>
      </div>
      <Card>
        <CardContent className="p-6">
          <HealthTimeline records={records} />
        </CardContent>
      </Card>
    </div>
  )
}
