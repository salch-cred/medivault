'use client'

import { Toaster } from '@/components/ui/sonner'
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react'
import { ZG } from '@/lib/og/config'

// Use a demo project ID. The user should replace this in production.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694'

const aristotle = {
  chainId: ZG.CHAIN_ID,
  name: ZG.CHAIN_NAME,
  currency: ZG.CURRENCY.symbol,
  explorerUrl: ZG.BLOCK_EXPLORER,
  rpcUrl: ZG.RPC_URL
}

const metadata = {
  name: 'MediVault',
  description: 'Your Health Vault',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://medivault.vercel.app', 
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: false,
})

createWeb3Modal({
  ethersConfig,
  chains: [aristotle],
  projectId,
  enableAnalytics: false,
  enableSwaps: false,
  enableOnramp: false,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-color-mix': '#000000',
    '--w3m-color-mix-strength': 20
  }
})

import { AutoConnectManager } from '@/components/auto-connect-manager'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AutoConnectManager />
      {children}
      <Toaster />
    </>
  )
}
