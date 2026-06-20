'use client'

import { useEffect, useRef } from 'react'
import { useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'
import { useVault } from '@/lib/store'
import { BrowserProvider } from 'ethers'

export function WalletConnect() {
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

  return (
    <div className="flex items-center">
      {/* 
        This is the official Web3Modal button that handles the QR code modal, 
        wallet selection, deep linking on mobile, and the user's address/balance display.
      */}
      <w3m-button balance="hide" size="md" />
    </div>
  )
}
