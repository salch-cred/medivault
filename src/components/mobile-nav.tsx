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
            const isEmergency = item.href === '/vault/emergency'
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[10px] font-medium"
              >
                {/* Active pill (animates between tabs via layoutId). */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-tab-pill"
                    className={cn(
                      'absolute top-1 h-9 w-14 rounded-full',
                      isEmergency ? 'bg-red-500/10' : 'bg-primary/10',
                    )}
                    transition={springSnappy}
                  />
                )}
                {/* Active dot above the icon (Mobbin-style cue). */}
                {isActive && (
                  <motion.span
                    layoutId="mobile-tab-dot"
                    className={cn(
                      'absolute top-0 h-1 w-1 rounded-full',
                      isEmergency ? 'bg-red-500' : 'bg-primary',
                    )}
                    transition={springSnappy}
                  />
                )}
                <Icon
                  className={cn(
                    'relative z-10 h-[22px] w-[22px] transition-colors',
                    isActive
                      ? isEmergency
                        ? 'text-red-500'
                        : 'text-primary'
                      : 'text-muted-foreground',
                  )}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span
                  className={cn(
                    'relative z-10 transition-colors',
                    isActive
                      ? isEmergency
                        ? 'text-red-500'
                        : 'text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
