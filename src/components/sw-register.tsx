'use client'

import { useEffect } from 'react'

/**
 * Registers the MediVault service worker on mount.
 * Must be a Client Component so it can call navigator.serviceWorker.
 * Renders nothing — purely a side-effect component.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Register after the page has fully loaded so SW install never competes
    // with initial page resources.
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Check for updates on every page load.
          reg.update().catch(() => {})
        })
        .catch((err) => {
          console.warn('[SW] Registration failed (non-fatal):', err)
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
