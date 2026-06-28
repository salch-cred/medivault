'use client'

import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { pageTransition } from '@/lib/motion'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    // reducedMotion="user" makes framer-motion auto-disable transforms when the
    // OS-level setting is on; otherwise we animate transform/opacity only
    // (no blur filter, which forced repaints and dropped frames on mobile).
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          variants={pageTransition}
          initial="initial"
          animate="animate"
          exit="exit"
          className="w-full h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  )
}
