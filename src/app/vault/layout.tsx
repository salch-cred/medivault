import { SiteHeader } from '@/components/site-header'
import { MobileNav } from '@/components/mobile-nav'
import { PageTransition } from '@/components/page-transition'

import { DesktopSidebar } from '@/components/desktop-sidebar'

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <DesktopSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <SiteHeader />
        {/* px-safe keeps content clear of curved-edge / landscape insets;
            pb-28 clears the tall bottom tab bar (incl. home indicator). */}
        <main className="container px-safe pb-28 pt-6 md:pb-10 md:pt-8 flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <MobileNav />
      </div>
    </div>
  )
}
