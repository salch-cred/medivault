'use client'

import { ethers } from 'ethers'
import { ZG } from './config'

export type WalletContext = {
  provider: ethers.BrowserProvider
  signer: ethers.Signer
  address: string
}

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider & {
      on?: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

/** Ensure MetaMask is on the 0G Galileo testnet, adding it if necessary. */
export async function ensureChain(): Promise<void> {
  if (!hasMetaMask()) throw new Error('MetaMask not found')
  const eth = window.ethereum!
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ZG.CHAIN_ID_HEX }],
    })
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code
    // 4902 = chain not added yet.
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: ZG.CHAIN_ID_HEX,
            chainName: ZG.CHAIN_NAME,
            nativeCurrency: ZG.CURRENCY,
            rpcUrls: [ZG.RPC_URL],
            blockExplorerUrls: [ZG.BLOCK_EXPLORER],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

export async function connectWallet(): Promise<WalletContext> {
  if (hasMetaMask()) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!)
      await provider.send('eth_requestAccounts', [])
      await ensureChain()
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      return { provider, signer, address }
    } catch (error) {
      console.error('MetaMask connection failed, falling back to burner wallet:', error)
    }
  }
  
  // Burner wallet fallback for instant connection
  const rpcProvider = new ethers.JsonRpcProvider(ZG.RPC_URL)
  let privateKey = localStorage.getItem('medivault_burner_key')
  if (!privateKey) {
    const randomWallet = ethers.Wallet.createRandom()
    privateKey = randomWallet.privateKey
    localStorage.setItem('medivault_burner_key', privateKey)
    import('sonner').then(({ toast }) => {
      toast.success('Created a temporary Burner Wallet for testing.')
    })
  } else {
    import('sonner').then(({ toast }) => {
      toast.info('Connected to your existing temporary Burner Wallet.')
    })
  }
  const wallet = new ethers.Wallet(privateKey, rpcProvider)
  
  // We cast rpcProvider to any here because WalletContext expects a BrowserProvider,
  // but for our fallback demo purposes JsonRpcProvider provides the necessary RPC interface.
  return { provider: rpcProvider as any, signer: wallet, address: wallet.address }
}
