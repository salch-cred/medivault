'use client'

import { useWeb3Modal, useWeb3ModalAccount } from '@web3modal/ethers/react'
import { useVault } from '@/lib/store'
import { Wallet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shortHash } from '@/lib/utils'

export function WalletConnect() {
  const { open } = useWeb3Modal()
  const { address } = useWeb3ModalAccount()
  const { status } = useVault()

  if (status === 'connected' && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-secondary px-3 py-1.5 font-mono text-xs sm:inline">
          {shortHash(address, 6, 4)}
        </span>
        <Button variant="ghost" size="icon" onClick={() => open()} title="Wallet settings">
          <Wallet className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={() => open()}
      disabled={status === 'connecting'}
      className="bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {status === 'connecting' ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Wallet className="h-4 w-4 mr-2" />
      )}
      {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
    </Button>
  )
}
