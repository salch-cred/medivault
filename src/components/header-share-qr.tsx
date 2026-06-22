'use client'

import { useState } from 'react'
import { QrCode, X, Copy, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVault } from '@/lib/store'

/**
 * Compact QR button shown next to the MediVault brand (mobile/tablet only).
 * Tapping it opens a dialog with a scannable QR of the user's sharing address
 * so another person can scan it with their phone camera and receive records.
 * The address is also shown and copyable.
 */
export function HeaderShareQr() {
  const { address } = useVault()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!address) return null

  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('MediVault ID copied!', {
      description: 'Share this address so others can send you records.',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button
        type="button"
        aria-label="Show my sharing QR code"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-foreground shadow-sm transition-transform active:scale-95 lg:hidden"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-xs rounded-2xl border border-border bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="mb-1 text-center text-base font-bold">My MediVault ID</h3>
            <p className="mb-4 text-center text-xs text-muted-foreground">
              Scan this to get my sharing address
            </p>

            <div className="mx-auto w-fit rounded-xl border bg-white p-3">
              <QRCodeSVG value={address} size={200} level="M" bgColor="#ffffff" fgColor="#000000" />
            </div>

            <p className="mt-4 break-all text-center font-mono text-xs text-muted-foreground">
              {address}
            </p>

            <Button className="mt-4 w-full" size="sm" onClick={copyAddress}>
              {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy address'}
            </Button>

            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              {shortAddr} &middot; Only you can decrypt what&apos;s sent to you
            </p>
          </div>
        </div>
      )}
    </>
  )
}
