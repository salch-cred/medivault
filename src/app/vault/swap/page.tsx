'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react'
import { ethers } from 'ethers'
import { toast } from 'sonner'
import { ArrowLeftRight, Globe, Send, Loader2, Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ZG } from '@/lib/og/config'

// Motion presets declared as objects to avoid inline double-brace JSX.
const MOTION_INITIAL = { opacity: 0, y: 8 }
const MOTION_ANIMATE = { opacity: 1, y: 0 }

// LI.FI widget is client-only; load it without SSR to avoid hydration/build issues.
const CrossChainWidget = dynamic(() => import('@/components/cross-chain-widget'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[550px] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

export default function SwapPage() {
  const { walletProvider } = useWeb3ModalProvider()
  const { address, isConnected } = useWeb3ModalAccount()
  const [amount, setAmount] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleInternalTransfer() {
    if (!isConnected || !walletProvider) {
      toast.error('Connect your wallet first')
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!toAddress || !ethers.isAddress(toAddress)) {
      toast.error('Enter a valid destination address')
      return
    }
    setSending(true)
    try {
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      })
      toast.success('Transaction sent', { description: tx.hash })
      await tx.wait()
      toast.success('Transfer confirmed')
      setAmount('')
      setToAddress('')
    } catch (err: any) {
      toast.error('Transfer failed', { description: err?.shortMessage || err?.message || 'Unknown error' })
    } finally {
      setSending(false)
    }
  }

  async function copyAddress() {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <motion.div
        initial={MOTION_INITIAL}
        animate={MOTION_ANIMATE}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight">Swap &amp; Transfer</h1>
        <p className="text-sm text-muted-foreground">Move funds internally on 0G or swap across chains.</p>
      </motion.div>

      <Tabs defaultValue="internal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="internal" className="gap-2">
            <Send className="h-4 w-4" /> Internal Transfer
          </TabsTrigger>
          <TabsTrigger value="crosschain" className="gap-2">
            <Globe className="h-4 w-4" /> Cross-Chain Swap
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          <Card className="border-border/50 bg-background/60 shadow-xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4" /> Send OG on 0G Mainnet
              </CardTitle>
              <CardDescription className="text-xs">
                Transfer OG from your connected wallet to any 0G address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Amount (OG)</Label>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.0001"
                />
              </div>
              <div className="space-y-2">
                <Label>Destination Address</Label>
                <Input
                  placeholder="0x..."
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
              <Button
                onClick={handleInternalTransfer}
                disabled={sending}
                className="w-full"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Send Transfer
                  </>
                )}
              </Button>
              {address && (
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Your wallet</span>
                  <button
                    onClick={copyAddress}
                    className="flex items-center gap-1.5 font-mono text-foreground transition-colors hover:text-primary"
                  >
                    {address.slice(0, 6)}...{address.slice(-4)}
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crosschain" className="mt-4 space-y-4">
          <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider">Heads up</p>
              <p className="leading-relaxed">
                Swap or bridge across 60+ chains using the open-source LI.FI widget. 0G Mainnet may
                not be selectable as a destination yet &mdash; to bridge directly into 0G, use the
                XSwap link below and search <strong>0G</strong> (with a zero, not the letter O).
              </p>
            </div>
          </div>

          <Card className="overflow-hidden border-border/50 bg-background/60 shadow-xl backdrop-blur-xl">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-sm">Cross-Chain Swap &amp; Bridge</CardTitle>
              <CardDescription className="text-xs">
                Powered by LI.FI &mdash; open-source liquidity aggregation.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-3">
              <CrossChainWidget />
            </CardContent>
          </Card>

          {address && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Auto-wallet (paste as recipient)</span>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1.5 font-mono text-foreground transition-colors hover:text-primary"
              >
                {address.slice(0, 6)}...{address.slice(-4)}
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          )}

          <a
            href="https://xswap.link/bridge"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Bridge directly into 0G via XSwap
          </a>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>
}
