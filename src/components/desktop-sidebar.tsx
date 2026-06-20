'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldPlus, FolderOpen, Clock, Activity, ArrowRightLeft, HeartPulse, MessageSquare, Database } from 'lucide-react'
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

export function DesktopSidebar() {
  const pathname = usePathname()
  
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border/40 bg-background/90 backdrop-blur-xl h-screen sticky top-0 px-4 py-6">
      <Link href="/" className="flex items-center gap-2 font-bold group mb-10 px-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-active:scale-95">
          <ShieldPlus className="h-5 w-5" />
        </span>
        <span className="inline-block text-xl tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
          MediVault
        </span>
      </Link>
      
      <nav className="flex flex-1 flex-col gap-2">
        {NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-4 rounded-lg px-3 py-3 text-sm font-medium transition-all group',
                isActive
                  ? 'text-foreground font-bold'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Icon 
                className={cn(
                  "h-6 w-6 transition-transform group-active:scale-95", 
                  isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={cn(isActive ? "font-bold" : "font-medium")}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
      
      <div className="mt-auto pt-6 border-t border-border/40">
        <WalletConnect />
      </div>
    </aside>
  )
}
