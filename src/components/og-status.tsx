'use client'

import { useEffect, useState } from 'react'
import { Database, Cpu, HardDrive, Link2, Copy, Wallet, RefreshCw, Zap } from 'lucide-react'
import { ethers } from 'ethers'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ZG } from '@/lib/og/config'
import { useVault } from '@/lib/store'
import { createAuthedProvider } from '@/lib/client/auth'
import { toast } from 'sonner'
import Link from 'next/link'

const ITEMS = [
  { icon: Link2, label: 'Chain', value: `${ZG.CHAIN_NAME} · ${ZG.CHAIN_ID}` },
  { icon: HardDrive, label: 'Storage indexer', value: 'mainnet' },
  { icon: Database, label: 'KV index', value: '0G-KV mainnet' },
  { icon: Cpu, label: 'AI compute', value: '0G Compute router' },
]

export function OgStatus() {
  const { autoWalletAddress, autoWalletSigner, signer, address } = useVault()
  const [balance, setBalance] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchBalance = async () => {
    if (!autoWalletAddress) return
    setIsRefreshing(true)
    try {
      // Use authed provider so the RPC proxy accepts the request.
      const provider = await createAuthedProvider(signer ?? autoWalletSigner, address ?? autoWalletAddress, ZG.RPC_URL)
      const bal = await provider.getBalance(autoWalletAddress)
      setBalance(Number(ethers.formatEther(bal)).toFixed(4) + ' OG')
    } catch (e) {
      console.error('Failed to fetch balance', e)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 10000)
    return () => clearInterval(interval)
  }, [autoWalletAddress, autoWalletSigner, signer, address])

  const handleAddNetwork = async () => {
    // @ts-ignore - window.ethereum is not strictly typed
    if (!window.ethereum) {
      toast.error('No Web3 wallet found! Please install MetaMask or Rabby.')
      return
    }

    try {
      // @ts-ignore
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: ZG.CHAIN_ID_HEX,
            chainName: ZG.CHAIN_NAME,
            rpcUrls: ['https://evmrpc.0g.ai'],
            nativeCurrency: ZG.CURRENCY,
            blockExplorerUrls: [ZG.BLOCK_EXPLORER],
          },
        ],
      })
      toast.success('0G Mainnet successfully added to your wallet!')
    } catch (e) {
      toast.error('Failed to add 0G Mainnet to your wallet.')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          0G storage status
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pb-4">
        {ITEMS.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 pt-0">
        {autoWalletAddress && (
          <div className="flex flex-col gap-1.5 rounded-lg border bg-emerald-500/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Auto-Wallet</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {autoWalletAddress.slice(0, 6)}...{autoWalletAddress.slice(-4)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                  onClick={() => {
                    navigator.clipboard.writeText(autoWalletAddress)
                    toast.success('Auto-Wallet address copied!')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Mainnet Balance</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {balance !== null ? balance : '...'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-5 w-5 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-500 ${isRefreshing ? 'animate-spin' : ''}`}
                  onClick={fetchBalance}
                  disabled={isRefreshing}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <Link href="/vault/swap" className="w-full">
          <Button variant="secondary" className="w-full text-xs font-medium" size="sm">
            <Zap className="mr-2 h-3.5 w-3.5" />
            Transfer Funds (Swap)
          </Button>
        </Link>
        <Button onClick={handleAddNetwork} variant="secondary" className="w-full text-xs font-medium" size="sm">
          <Wallet className="mr-2 h-3.5 w-3.5" />
          Add 0G Mainnet to Wallet
        </Button>
      </CardFooter>
    </Card>
  )
}
