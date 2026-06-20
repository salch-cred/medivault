'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowDown, Wallet, Zap, Loader2, Info, Globe } from 'lucide-react'
import Link from 'next/link'
import { ethers } from 'ethers'
import { useWeb3ModalProvider, useWeb3ModalAccount } from '@web3modal/ethers/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVault } from '@/lib/store'
import { toast } from 'sonner'
import { ConnectGate } from '@/components/connect-gate'
import { ZG } from '@/lib/og/config'

export default function SwapPage() {
  const { autoWalletAddress } = useVault()
  const { address: mainWalletAddress, isConnected } = useWeb3ModalAccount()
  const { walletProvider } = useWeb3ModalProvider()
  
  const [amount, setAmount] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [mainBalance, setMainBalance] = useState('0')
  const [autoBalance, setAutoBalance] = useState('0')

  const fetchBalances = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
      
      if (mainWalletAddress) {
        const mBal = await provider.getBalance(mainWalletAddress)
        setMainBalance(ethers.formatEther(mBal))
      }
      
      if (autoWalletAddress) {
        const aBal = await provider.getBalance(autoWalletAddress)
        setAutoBalance(ethers.formatEther(aBal))
      }
    } catch (e) {
      console.error('Failed to fetch balances:', e)
    }
  }

  useEffect(() => {
    fetchBalances()
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [mainWalletAddress, autoWalletAddress])

  const handleTransfer = async () => {
    if (!walletProvider || !mainWalletAddress || !autoWalletAddress) {
      toast.error('Wallet not fully connected.')
      return
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsTransferring(true)
    try {
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      
      const tx = await signer.sendTransaction({
        to: autoWalletAddress,
        value: ethers.parseEther(amount)
      })
      
      toast.info('Transaction submitted to network', {
        description: 'Waiting for confirmation...'
      })
      
      await tx.wait()
      
      toast.success('Transfer successful!', {
        description: `Successfully sent ${amount} OG to your Auto-Wallet.`
      })
      setAmount('')
      fetchBalances()
    } catch (error: any) {
      console.error(error)
      toast.error('Transfer failed', {
        description: error.message || 'The transaction was rejected or failed.'
      })
    } finally {
      setIsTransferring(false)
    }
  }

  return (
    <ConnectGate>
      <div className="mx-auto max-w-xl space-y-6 pt-4 pb-12">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fund Auto-Wallet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Transfer OG tokens internally or swap from other networks to pay for decentralized storage.
            </p>
          </div>

          <Tabs defaultValue="internal" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="internal">
                <Wallet className="w-4 h-4 mr-2" />
                Internal Transfer
              </TabsTrigger>
              <TabsTrigger value="crosschain">
                <Globe className="w-4 h-4 mr-2" />
                Cross-Chain Swap
              </TabsTrigger>
            </TabsList>

            {/* INTERNAL TRANSFER TAB */}
            <TabsContent value="internal" className="mt-4 space-y-4">
              <Card className="border-border/50 bg-background/60 shadow-xl backdrop-blur-xl">
                <CardContent className="p-6 space-y-6">
                  {/* Main Wallet (From) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-muted-foreground">From</Label>
                      <span className="text-xs text-muted-foreground">Main Wallet</span>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-mono text-sm">{mainWalletAddress ? `${mainWalletAddress.slice(0, 6)}...${mainWalletAddress.slice(-4)}` : 'Not connected'}</p>
                            <p className="text-xs text-muted-foreground">Balance: {Number(mainBalance).toFixed(4)} OG</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow Indicator */}
                  <div className="relative flex justify-center py-2">
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"></div>
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
                      <ArrowDown className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Auto Wallet (To) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-muted-foreground">To</Label>
                      <span className="text-xs text-muted-foreground">Auto-Wallet</span>
                    </div>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                            <Zap className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-mono text-sm text-emerald-600 dark:text-emerald-400">
                              {autoWalletAddress ? `${autoWalletAddress.slice(0, 6)}...${autoWalletAddress.slice(-4)}` : 'Generating...'}
                            </p>
                            <p className="text-xs text-muted-foreground">Balance: {Number(autoBalance).toFixed(4)} OG</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Amount to transfer</Label>
                      <button 
                        onClick={() => setAmount(Number(mainBalance) > 0.01 ? (Number(mainBalance) - 0.01).toString() : '0')}
                        className="text-xs text-primary hover:underline"
                      >
                        Max (save gas)
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="h-14 text-lg font-mono placeholder:text-muted-foreground/50 pr-16"
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        <span className="text-sm font-semibold text-muted-foreground">OG</span>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button 
                    onClick={handleTransfer} 
                    disabled={isTransferring || !amount || Number(amount) <= 0}
                    className="w-full h-12 text-base font-semibold shadow-lg"
                    size="lg"
                  >
                    {isTransferring ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Transfer Funds'
                    )}
                  </Button>
                </CardContent>
              </Card>

              <div className="rounded-xl border bg-muted/50 p-4 flex gap-3 text-sm text-muted-foreground">
                <Info className="h-5 w-5 shrink-0 text-primary" />
                <p>
                  Your Auto-Wallet uses a small amount of OG tokens (gas) to instantly encrypt and store your files on the 0G Network securely. You own both wallets.
                </p>
              </div>
            </TabsContent>

            {/* CROSS CHAIN SWAP TAB */}
            <TabsContent value="crosschain" className="mt-4">
              <Card className="border-border/50 bg-background/60 shadow-xl backdrop-blur-xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">Cross-Chain Swap (XSwap Bridge)</CardTitle>
                  <CardDescription>
                    Bridge tokens from any network directly into OG tokens using the official XSwap bridge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 sm:p-2 bg-muted/10 h-[600px] relative">
                  {/* XSwap Iframe Widget */}
                  <iframe 
                    id="iframe-widget" 
                    src={`https://xswap.link/bridge?toChain=16661`} 
                    style={{ height: '100%', width: '100%', border: 'none', borderRadius: '8px' }}
                    allow="clipboard-read; clipboard-write"
                  ></iframe>
                </CardContent>
              </Card>
              
              {/* Copy Auto-Wallet Shortcut */}
              <div className="mt-4 rounded-xl border bg-muted/50 p-4 flex flex-col gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  <p className="font-medium">Need to fund your Auto-Wallet directly?</p>
                </div>
                <div className="flex items-center justify-between bg-background p-2 rounded-lg border mt-1">
                  <span className="font-mono text-xs">{autoWalletAddress || 'Generating...'}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs" 
                    onClick={() => {
                      if(autoWalletAddress) {
                        navigator.clipboard.writeText(autoWalletAddress)
                        toast.success('Auto-Wallet Address copied!')
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

        </motion.div>
      </div>
    </ConnectGate>
  )
}

function Label({ className, children }: { className?: string, children: React.ReactNode }) {
  return <label className={className}>{children}</label>
}
