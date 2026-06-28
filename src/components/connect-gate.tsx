'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, Lock, KeyRound, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { WalletConnect } from '@/components/wallet-connect'
import { Disclaimer } from '@/components/disclaimer'
import { useVault } from '@/lib/store'
import { staggerContainer, staggerItem } from '@/lib/motion'

function friendlyWalletError(error: string): string {
  const lower = error.toLowerCase()

  if (
    lower.includes('ethers-user-denied') ||
    lower.includes('action_rejected') ||
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('request rejected') ||
    lower.includes('4001')
  ) {
    return 'Wallet request was cancelled. Please connect again and approve the signature to unlock your vault.'
  }

  if (
    lower.includes('walletconnect') ||
    lower.includes('relay.walletconnect') ||
    lower.includes('rpc.walletconnect') ||
    lower.includes('websocket')
  ) {
    return 'WalletConnect could not connect. Please refresh and try again, or use the browser wallet extension directly.'
  }

  if (lower.includes('no provider') || lower.includes('ethereum provider')) {
    return 'No wallet was found. Please install or enable a Web3 wallet, then try again.'
  }

  if (error.length > 180 || error.trim().startsWith('{')) {
    return 'Wallet connection failed. Please refresh and try connecting again.'
  }

  return error
}

export function ConnectGate({ children }: { children: React.ReactNode }) {
  const { status, error } = useVault()

  if (status === 'connected') return <>{children}</>

  // Only show "reconnecting" when WE are actively connecting.
  // Do NOT auto-trigger based on Web3Modal's isConnected state.
  const reconnecting = !error && status === 'connecting'

  if (reconnecting) {
    return (
      <motion.div
        variants={staggerContainer(0.08, 0.05)}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-xl py-8 md:py-12"
      >
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-5 p-7 text-center md:p-9">
            <motion.span
              variants={staggerItem}
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary md:h-16 md:w-16"
            >
              <Loader2 className="h-7 w-7 animate-spin md:h-8 md:w-8" />
            </motion.span>
            <motion.div variants={staggerItem}>
              <h2 className="font-serif text-2xl tracking-tight md:text-3xl">
                Reconnecting your vault…
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground md:text-[15px]">
                Restoring your encrypted records. The first time you open the app in a
                browser session you may be asked to sign once to unlock your keys.
              </p>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.08, 0.05)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-xl py-8 md:py-12"
    >
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-5 p-7 text-center md:p-9">
          <motion.span
            variants={staggerItem}
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary md:h-16 md:w-16"
          >
            <ShieldCheck className="h-7 w-7 md:h-8 md:w-8" />
          </motion.span>
          <motion.div variants={staggerItem}>
            <h2 className="font-serif text-2xl tracking-tight md:text-3xl">
              Connect your wallet to open your vault
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground md:text-[15px]">
              Your wallet is your identity and holds your keys. We derive your encryption key
              from a signature — there is no central database and no server-side key recovery.
            </p>
          </motion.div>
          <motion.div variants={staggerItem}>
            <WalletConnect />
          </motion.div>
          {error ? (
            <motion.p variants={staggerItem} className="text-sm text-destructive">
              {friendlyWalletError(error)}
            </motion.p>
          ) : null}
          <motion.div
            variants={staggerItem}
            className="grid w-full gap-2 pt-2 text-left text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0 text-primary" /> Key derived from your wallet signature
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0 text-primary" /> AES-256 encryption before anything leaves your device
            </div>
          </motion.div>
          <motion.div variants={staggerItem} className="w-full">
            <Disclaimer compact />
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
