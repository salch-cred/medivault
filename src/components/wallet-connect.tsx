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
      <button
        onClick={() => open()}
        title="Wallet settings"
        className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 transition-colors hover:bg-secondary/80 active:scale-95"
      >
        {/* Shorter hash on xs, longer from sm up */}
        <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs sm:hidden">
          {shortHash(address, 4, 3)}
        </span>
        <span className="hidden font-mono text-xs sm:inline">
          {shortHash(address, 6, 4)}
        </span>
      </button>
    )
  }

  // Wallet is already connected by Web3Modal (e.g. after a refresh) but the
  // vault key hasn't been derived yet — show a compact inline unlock button.
  if (address && walletProvider) {
    const unlockVault = () => {
      const provider = new BrowserProvider(walletProvider)
      void connect(provider, address)
    }

    return (
      <div className="flex items-center gap-1.5">
        <Button
          onClick={unlockVault}
          disabled={status === 'connecting'}
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs"
        >
          {status === 'connecting' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
          )}
          <span className="sm:hidden">{status === 'connecting' ? 'Unlocking…' : 'Unlock'}</span>
          <span className="hidden sm:inline">{status === 'connecting' ? 'Unlocking…' : 'Unlock vault'}</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open()} title="Wallet settings">
          <Wallet className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={() => open()}
      disabled={status === 'connecting'}
      size="sm"
      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"
    >
      {status === 'connecting' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
      ) : (
        <Wallet className="h-3.5 w-3.5 mr-1.5" />
      )}
      <span className="sm:hidden">{status === 'connecting' ? 'Connecting…' : 'Connect'}</span>
      <span className="hidden sm:inline">{status === 'connecting' ? 'Connecting…' : 'Connect wallet'}</span>
    </Button>
  )
}
