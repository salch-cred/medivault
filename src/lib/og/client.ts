'use client'

import { ethers } from 'ethers'
import { ZG } from './config'



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


