'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline-banner"
          initial= height: 0, opacity: 0 
          animate= height: 'auto', opacity: 1 
          exit= height: 0, opacity: 0 
          transition= duration: 0.2 
          className="overflow-hidden"
        >
          <div
            className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950"
            role="status"
            aria-live="polite"
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            You&apos;re offline — your encrypted records are still accessible from local cache.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
