'use client'

import { useEffect, useRef } from 'react'
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'
import { useVault } from '@/lib/store'
import { BrowserProvider } from 'ethers'
import { Wallet, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shortHash } from '@/lib/utils'

export function WalletConnect() {
  const { open } = useWeb3Modal()
  const { isConnected, address } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()
  const { status, connect, disconnect } = useVault()
  const lastAddress = useRef<string | undefined>()

  useEffect(() => {
    // When Web3Modal connects, sync with our Zustand store
    if (isConnected && address && walletProvider && status === 'disconnected') {
      const provider = new BrowserProvider(walletProvider)
      connect(provider, address)
    }
    
    // When Web3Modal disconnects or switches accounts, reset our store
    if (!isConnected && status !== 'disconnected') {
      disconnect()
    } else if (isConnected && address && lastAddress.current && address !== lastAddress.current) {
      disconnect()
    }
    lastAddress.current = address
  }, [isConnected, address, walletProvider, status, connect, disconnect])

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
