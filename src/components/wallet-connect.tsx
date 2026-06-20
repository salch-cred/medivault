'use client'

import { Wallet, LogOut, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVault } from '@/lib/store'
import { shortHash } from '@/lib/utils'
import { ZG } from '@/lib/og/config'

export function WalletConnect() {
  const { status, address, connect, disconnect } = useVault()

  if (status === 'connected' && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-secondary px-3 py-1.5 font-mono text-xs sm:inline">
          {shortHash(address, 6, 4)}
        </span>
        <Button variant="ghost" size="icon" onClick={disconnect} title="Disconnect">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={async () => {
        try {
          await connect()
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to connect')
        }
      }}
      disabled={status === 'connecting'}
    >
      {status === 'connecting' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wallet className="h-4 w-4" />
      )}
      {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
      <span className="sr-only">on {ZG.CHAIN_NAME}</span>
    </Button>
  )
}
