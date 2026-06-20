'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldPlus, FolderOpen, Clock, Activity, ArrowRightLeft, HeartPulse, MessageSquare, Database } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { WalletConnect } from '@/components/wallet-connect'

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
        <Link href="/" className="flex items-center gap-2 font-bold group">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md transition-transform group-active:scale-95 md:h-9 md:w-9">
            <ShieldPlus className="h-4 w-4 md:h-5 md:w-5" />
          </span>
          {/* Brand always visible on mobile (it's the only nav cue up top). */}
          <span className="inline-block text-base tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent md:text-lg">
            MediVault
          </span>
        </Link>
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
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn("h-4 w-4 relative z-10 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover/nav:text-foreground")} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2 md:gap-4">
          <WalletConnect />
        </div>
      </div>
    </header>
  )
}

