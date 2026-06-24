'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FolderOpen, Clock, Activity, ArrowRightLeft, HeartPulse, MessageSquare, Database } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'
import { WalletConnect } from '@/components/wallet-connect'
import { HeaderShareQr } from '@/components/header-share-qr'

const NAV = [
  { href: '/vault', label: 'Vault', icon: FolderOpen },
  { href: '/vault/timeline', label: 'Timeline', icon: Clock },
  { href: '/vault/trends', label: 'Lab trends', icon: Activity },
  { href: '/vault/handoff', label: 'Doctor handoff', icon: ArrowRightLeft },
  { href: '/vault/emergency', label: 'Emergency', icon: HeartPulse },
  { href: '/vault/transactions', label: 'Transactions', icon: Database },
  { href: '/vault/chat', label: 'Chat', icon: MessageSquare },
]

export function SiteHeader() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/90 backdrop-blur-xl transition-all shadow-sm pt-safe">
      <div className="container flex h-14 items-center justify-between gap-3 md:h-16">

        {/* Left — logo + brand (mobile only; desktop uses sidebar) */}
        <Link href="/" className="flex items-center gap-2 font-bold group md:hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="MediVault logo"
            className="h-8 w-8 rounded-xl shadow-md transition-transform group-active:scale-95"
          />
          <span className="inline-block text-base tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            MediVault
          </span>
        </Link>

        {/* Centre — desktop nav */}
        <nav className="hidden items-center gap-1.5 lg:flex">
          {NAV.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative rounded-full px-3.5 py-2 text-sm font-semibold transition-all flex items-center gap-2 group/nav',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="desktop-nav-active"
                    className="absolute inset-0 rounded-full bg-primary/10 border border-primary/20 shadow-inner"
                    transition={springSnappy}
                  />
                )}
                <Icon className={cn('h-4 w-4 relative z-10 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover/nav:text-foreground')} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/*
          Right — QR button + wallet address.
          QR lives here (not left) so it sits right next to the wallet
          identity pill — makes spatial sense and keeps the left side clean.
        */}
        <div className="flex items-center gap-2">
          <HeaderShareQr />
          <WalletConnect />
        </div>

      </div>
    </header>
  )
}
