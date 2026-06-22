'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  LineChart,
  MessageSquare,
  HeartPulse,
  Clock,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { springSnappy } from '@/lib/motion'

/**
 * Mobile bottom tab bar (Mobbin-style).
 *
 * Design notes:
 *  - Five primary destinations, icon + label, generous tap targets (>=44px).
 *  - A floating "pill" indicator animates under the active tab with a spring.
 *  - Translucent frosted background sits above content; bottom padding honors
 *    the home indicator via pb-safe.
 *  - Only transform/opacity animate, keeping it on the compositor (60fps).
 */

const MOBILE_NAV = [
  { href: '/vault', label: 'Vault', icon: FolderOpen },
  { href: '/vault/timeline', label: 'Timeline', icon: Clock },
  { href: '/vault/trends', label: 'Trends', icon: LineChart },
  { href: '/vault/chat', label: 'Chat', icon: MessageSquare },
  { href: '/vault/emergency', label: 'SOS', icon: HeartPulse },
  { href: '/vault/swap', label: 'Swap', icon: Zap },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 md:hidden print:hidden"
    >
      {/* Frosted background with a top hairline + safe-area bottom fill. */}
      <div className="border-t border-border/60 bg-background/80 backdrop-blur-xl pb-safe">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {MOBILE_NAV.map((item) => {
            // Exact match for /vault; startsWith for nested sub-routes.
            const isActive =
              pathname === item.href ||
              (item.href !== '/vault' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center pt-2 pb-1.5"
              >
                {/* Active dot below the icon */}
                {isActive && (
                  <motion.span
                    layoutId="mobile-tab-dot"
                    className="absolute bottom-1 h-1 w-1 rounded-full bg-foreground"
                    transition={springSnappy}
                  />
                )}
                <Icon
                  className={cn(
                    'relative z-10 h-6 w-6 transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
