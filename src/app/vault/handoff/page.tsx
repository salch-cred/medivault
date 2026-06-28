'use client'

import { ConnectGate } from '@/components/connect-gate'
import { DoctorHandoff } from '@/components/doctor-handoff'
import { useVault } from '@/lib/store'
import { useVaultRecords } from '@/hooks/use-vault-records'

export default function HandoffPage() {
  return (
    <ConnectGate>
      <HandoffInner />
    </ConnectGate>
  )
}

function HandoffInner() {
  const records = useVaultRecords()
  const { address } = useVault()
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">Doctor handoff</h1>
      </div>
      <DoctorHandoff records={records} address={address} />
    </div>
  )
}
