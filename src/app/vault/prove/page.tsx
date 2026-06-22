'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ConnectGate } from '@/components/connect-gate'
import { ProofBuilder } from '@/components/proof-builder'

export default function ProvePage() {
  return (
    <ConnectGate>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          href="/vault"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
        <ProofBuilder />
      </div>
    </ConnectGate>
  )
}
