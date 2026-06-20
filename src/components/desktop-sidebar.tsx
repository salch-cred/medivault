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
    <aside className="hidden md:flex flex-col w-64 border-r border-neutral-900 bg-black h-screen sticky top-0 px-4 py-8">
      <Link href="/" className="flex items-center gap-3 font-bold group mb-10 px-3 transition-transform duration-200 active:scale-95">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black shadow-md transition-all duration-300 group-hover:rotate-6">
          <ShieldPlus className="h-5 w-5" />
        </span>
        <span className="inline-block text-xl font-bold tracking-tight text-white font-serif italic">
          MediVault
        </span>
      </Link>
      
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/vault' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative',
                isActive
                  ? 'text-white bg-neutral-900/50'
                  : 'text-neutral-400 hover:bg-neutral-900/40 hover:text-white',
              )}
            >
              <Icon 
                className={cn(
                  "h-6 w-6 transition-all duration-200 group-hover:scale-110", 
                  isActive ? "text-white scale-105" : "text-neutral-400 group-hover:text-white"
                )} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={cn(isActive ? "font-bold text-white" : "font-medium")}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
      
      <div className="mt-auto pt-6 border-t border-neutral-900">
        <WalletConnect />
      </div>
    </aside>
  )
}
