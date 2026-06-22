'use client'

import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'
import { BrowserProvider } from 'ethers'
import { useVault } from '@/lib/store'
import { Wallet, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shortHash } from '@/lib/utils'

export function WalletConnect() {
  const { open } = useWeb3Modal()
  const { address } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()
  const { status, connect } = useVault()

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

  // WalletConnect may already be restored after a browser refresh while the
  // encrypted vault is still locked. In that state, do not ask the user to
  // reconnect the wallet; ask them to unlock the vault with a fresh signature.
  // This preserves security because the vault key is re-derived in memory and
  // never persisted across refreshes.
  if (address && walletProvider) {
    const unlockVault = () => {
      const provider = new BrowserProvider(walletProvider)
      void connect(provider, address)
    }

    return (
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Button
          onClick={unlockVault}
          disabled={status === 'connecting'}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {status === 'connecting' ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <KeyRound className="h-4 w-4 mr-2" />
          )}
          {status === 'connecting' ? 'Unlocking…' : 'Unlock vault'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => open()}>
          Wallet settings
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
