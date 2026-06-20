'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { ArrowDown, Wallet, Zap, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useVault } from '@/lib/store'
import { useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react'
import { ZG } from '@/lib/og/config'

export function AIChatFundAction({
  args,
}: {
  args: { amount: string }
}) {
  const { autoWalletAddress } = useVault()
  const { address: mainWalletAddress } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()

  const [transferring, setTransferring] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [mainBalance, setMainBalance] = useState('0')
  const [autoBalance, setAutoBalance] = useState('0')
  const [resolvedAmount, setResolvedAmount] = useState(args.amount)

  useEffect(() => {
    async function fetchBalances() {
      try {
        const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
        if (mainWalletAddress) {
          const mBal = await provider.getBalance(mainWalletAddress)
          const formatted = ethers.formatEther(mBal)
          setMainBalance(formatted)
          // If user said "max", resolve it to balance minus gas reserve
          if (args.amount === 'max') {
            const maxAmount = Number(formatted) > 0.01 ? (Number(formatted) - 0.01).toFixed(6) : '0'
            setResolvedAmount(maxAmount)
          }
        }
        if (autoWalletAddress) {
          const aBal = await provider.getBalance(autoWalletAddress)
          setAutoBalance(ethers.formatEther(aBal))
        }
      } catch (e) {
        console.error('Failed to fetch balances:', e)
      }
    }
    fetchBalances()
  }, [mainWalletAddress, autoWalletAddress, args.amount])

  async function handleTransfer() {
    if (!walletProvider || !mainWalletAddress || !autoWalletAddress) {
      toast.error('Wallet not fully connected.')
      return
    }
    if (!resolvedAmount || Number(resolvedAmount) <= 0) {
      toast.error('Invalid amount.')
      return
    }

    setTransferring(true)
    try {
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()

      const tx = await signer.sendTransaction({
        to: autoWalletAddress,
        value: ethers.parseEther(resolvedAmount),
      })

      toast.info('Transaction submitted!', { description: 'Waiting for confirmation...' })
      await tx.wait()

      setTxHash(tx.hash)
      toast.success(`Successfully sent ${resolvedAmount} OG to your Auto-Wallet!`)
    } catch (error: any) {
      console.error(error)
      toast.error('Transfer failed', {
        description: error.message || 'The transaction was rejected or failed.',
      })
    } finally {
      setTransferring(false)
    }
  }

  if (txHash) {
    return (
      <Card className="mt-2 bg-emerald-500/10 border-emerald-500/20 shadow-none">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
            <Check className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Transfer Complete — {resolvedAmount} OG sent!
            </p>
            <a
              href={`${ZG.BLOCK_EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-600/80 hover:text-emerald-600 dark:text-emerald-400/80 hover:underline"
            >
              View transaction on 0G Explorer →
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-2 bg-card shadow-sm border-border">
      <CardContent className="p-4 space-y-3">
        {/* From → To visual */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Main Wallet</p>
              <p className="font-mono text-xs">{mainWalletAddress ? `${mainWalletAddress.slice(0, 6)}...${mainWalletAddress.slice(-4)}` : '—'}</p>
              <p className="text-[11px] text-muted-foreground">Balance: {Number(mainBalance).toFixed(4)} OG</p>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="h-6 w-6 rounded-full border bg-background flex items-center justify-center text-muted-foreground shadow-sm">
              <ArrowDown className="h-3 w-3" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Zap className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">Auto-Wallet</p>
              <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{autoWalletAddress ? `${autoWalletAddress.slice(0, 6)}...${autoWalletAddress.slice(-4)}` : '—'}</p>
              <p className="text-[11px] text-muted-foreground">Balance: {Number(autoBalance).toFixed(4)} OG</p>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="bg-muted/50 p-3 rounded-lg border border-border/50 text-center">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Amount</p>
          <p className="text-xl font-bold font-mono">{resolvedAmount} <span className="text-sm text-muted-foreground">OG</span></p>
        </div>

        {/* Confirm Button */}
        <Button
          onClick={handleTransfer}
          disabled={transferring || Number(resolvedAmount) <= 0}
          className="w-full shadow-sm"
        >
          {transferring ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Wallet className="mr-2 h-4 w-4" />
              Confirm Transfer — {resolvedAmount} OG
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
