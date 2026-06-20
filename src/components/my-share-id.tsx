'use client'

import { useState } from 'react'
import { Copy, Check, Share2, QrCode, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useVault } from '@/lib/store'

export function MyShareId() {
  const { address } = useVault()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  if (!address) return null

  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}&bgcolor=ffffff&color=000000&margin=10`

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('MediVault ID copied!', {
      description: 'Share this address with doctors or family to receive medical records.',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const shareAddress = async () => {
    const text = `My MediVault ID: ${address}\n\nShare medical records securely with me at https://medivault-ecru.vercel.app`
    if (navigator.share) {
      await navigator.share({ title: 'My MediVault ID', text })
    } else {
      navigator.clipboard.writeText(text)
      toast.success('Share text copied to clipboard!')
    }
  }

  return (
    <>
      <Card className="border-blue-200/50 bg-gradient-to-br from-blue-500/5 to-indigo-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-blue-500" />
            My MediVault ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Share this address with doctors or family so they can securely send you medical records.
          </p>

          {/* Address display */}
          <div className="flex items-center gap-2 rounded-xl border border-blue-200/50 bg-background/60 px-3 py-2.5">
            <span className="flex-1 font-mono text-xs font-medium text-blue-700 dark:text-blue-400 truncate">
              {address}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700"
              onClick={copyAddress}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 text-xs font-medium"
              onClick={copyAddress}
            >
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy ID'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs font-medium"
              onClick={() => setShowQr(true)}
            >
              <QrCode className="mr-1.5 h-3.5 w-3.5" />
              QR Code
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs font-medium"
              onClick={shareAddress}
            >
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              Share
            </Button>
          </div>

          <p className="text-center text-[10px] text-muted-foreground">
            {shortAddr} · Only you can decrypt what's sent to you
          </p>
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQr(false)}
        >
          <div
            className="relative mx-4 rounded-2xl border border-border bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-7 w-7"
              onClick={() => setShowQr(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <h3 className="mb-1 text-center text-base font-bold">My MediVault ID</h3>
            <p className="mb-4 text-center text-xs text-muted-foreground">
              Scan to get my address
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR Code for wallet address"
              className="mx-auto h-48 w-48 rounded-xl border"
            />
            <p className="mt-4 text-center font-mono text-xs text-muted-foreground break-all">
              {address}
            </p>
            <Button
              className="mt-4 w-full"
              size="sm"
              onClick={copyAddress}
            >
              {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy Address'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
