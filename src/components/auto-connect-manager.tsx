'use client'

import { useEffect, useRef } from 'react'
import { useWeb3ModalAccount, useWeb3ModalProvider, useDisconnect } from '@web3modal/ethers/react'
import { useVault } from '@/lib/store'
import { BrowserProvider } from 'ethers'

export function AutoConnectManager() {
  const { isConnected, address } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()
  const { disconnect: disconnectW3M } = useDisconnect()
  const { status, error, connect, disconnect } = useVault()
  const lastAddress = useRef<string | undefined>()

  useEffect(() => {
    // If our vault connection failed (e.g. user rejected signature),
    // disconnect Web3Modal so we don't end up in an infinite signature request loop.
    if (error && isConnected) {
      disconnectW3M()
      return
    }

    // When Web3Modal connects, sync with our Zustand store
    if (isConnected && address && walletProvider && status === 'disconnected' && !error) {
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
  }, [isConnected, address, walletProvider, status, error, connect, disconnect, disconnectW3M])

  return null
}
