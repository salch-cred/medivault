'use client'

import { ConnectGate } from '@/components/connect-gate'
import { EmergencyCard } from '@/components/emergency-card'
import { Disclaimer } from '@/components/disclaimer'
import { useVaultRecords } from '@/hooks/use-vault-records'

export default function EmergencyPage() {
  return (
    <ConnectGate>
      <EmergencyInner />
    </ConnectGate>
  )
}

function EmergencyInner() {
  const records = useVaultRecords()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Emergency card</h1>
        <p className="text-sm text-muted-foreground">
          A minimal critical profile you can show or scan in an emergency.
        </p>
      </div>
      <EmergencyCard records={records} />
      <Disclaimer />
    </div>
  )
}
