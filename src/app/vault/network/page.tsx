'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ConnectGate } from '@/components/connect-gate'
import { NetworkHealth } from '@/components/network-health'

export default function NetworkPage() {
  return (
    <ConnectGate>
      <div className="space-y-6">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
        <NetworkHealth />
      </div>
    </ConnectGate>
  )
}
