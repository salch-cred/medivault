'use client'

import { useEffect, useRef } from 'react'
import { useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'
import { useVault } from '@/lib/store'
import { BrowserProvider } from 'ethers'

export function AutoConnectManager() {
  const { isConnected, address } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()
  const { status, error, connect, disconnect } = useVault()

  const lastAddress = useRef<string | null>(null)
  const attemptedAddress = useRef<string | null>(null)
  const connecting = useRef(false)

  useEffect(() => {
    const normalizedAddress = address?.toLowerCase() ?? null

    // Wallet was disconnected in Web3Modal: wipe all in-memory vault secrets.
    // Encrypted local caches stay encrypted on disk; the vault key/master seed
    // and auto-wallet private key are never persisted by the store.
    if (!isConnected || !normalizedAddress) {
      attemptedAddress.current = null
      connecting.current = false
      lastAddress.current = null
      if (status !== 'disconnected') disconnect()
      return
    }

    // Account switch: clear current in-memory vault state first, then let the
    // next effect pass unlock the new address. This prevents records/keys from
    // one wallet being shown under another wallet.
    if (lastAddress.current && lastAddress.current !== normalizedAddress) {
      attemptedAddress.current = null
      connecting.current = false
      lastAddress.current = normalizedAddress
      if (status !== 'disconnected') disconnect()
      return
    }
    lastAddress.current = normalizedAddress

    // If unlocking failed (usually user rejected the signature), do NOT
    // disconnect WalletConnect. Keep the non-secret wallet session available and
    // let the user press "Unlock vault" to retry. This avoids refresh loops and
    // avoids repeatedly popping signature prompts.
    if (error) {
      connecting.current = false
      return
    }

    // On refresh, Web3Modal restores the wallet session. Rebuild the secure
    // in-memory vault state by asking the wallet to sign again. We do this only
    // once per address automatically; no vault key, master seed, or auto-wallet
    // private key is saved across refreshes.
    if (
      walletProvider &&
      status === 'disconnected' &&
      attemptedAddress.current !== normalizedAddress &&
      !connecting.current
    ) {
      attemptedAddress.current = normalizedAddress
      connecting.current = true
      const provider = new BrowserProvider(walletProvider)
      void connect(provider, normalizedAddress).finally(() => {
        connecting.current = false
      })
    }
  }, [isConnected, address, walletProvider, status, error, connect, disconnect])

  return null
}
