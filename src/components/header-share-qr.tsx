'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { QrCode, X, Copy, Check, Camera, ScanLine } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVault } from '@/lib/store'
import { cn } from '@/lib/utils'

type Tab = 'my-qr' | 'scan'

declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  detect(
    image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<Array<{ rawValue: string; format: string }>>
  static getSupportedFormats(): Promise<string[]>
}

export function HeaderShareQr() {
  const { address } = useVault()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<Tab>('my-qr')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  if (!address) return null

  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`

  const copyAddr = useCallback(
    async (addr?: string) => {
      const toCopy = addr ?? address
      await navigator.clipboard.writeText(toCopy)
      setCopied(true)
      toast.success('Address copied!', {
        description: addr
          ? 'Scanned address is on your clipboard.'
          : 'Share this so others can send you records.',
      })
      setTimeout(() => setCopied(false), 2000)
    },
    [address],
  )

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  const handleClose = useCallback(() => {
    stopCamera()
    setOpen(false)
    setScanResult(null)
    setCameraError(null)
    setTab('my-qr')
  }, [stopCamera])

  const startScanner = useCallback(async () => {
    setScanResult(null)
    setCameraError(null)
    setScanning(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) { stopCamera(); return }
      video.srcObject = stream
      await video.play()
      setScanning(true)

      if (typeof BarcodeDetector === 'undefined') return

      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const hits = await detector.detect(video)
          if (hits.length > 0) {
            const result = hits[0].rawValue
            setScanResult(result)
            stopCamera()
            toast.success('QR scanned!', {
              description: result.length > 40 ? result.slice(0, 40) + '...' : result,
            })
            return
          }
        } catch { /* ignore per-frame errors */ }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.toLowerCase().includes('permission')
            ? 'Camera permission denied. Allow access and try again.'
            : err.message
          : 'Camera unavailable'
      setCameraError(msg)
    }
  }, [stopCamera])

  useEffect(() => {
    if (!open) return
    if (tab === 'scan') void startScanner()
    else { stopCamera(); setScanResult(null); setCameraError(null) }
    return () => stopCamera()
  }, [tab, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const bitmap = await createImageBitmap(file)
    if (typeof BarcodeDetector !== 'undefined') {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const hits = await detector.detect(bitmap)
        if (hits.length > 0) { setScanResult(hits[0].rawValue); stopCamera(); toast.success('QR decoded!'); return }
      } catch {}
    }
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = bitmap.width; canvas.height = bitmap.height
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    }
    toast.error('No QR code found - try a clearer image or move closer.')
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open QR and scanner"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-foreground shadow-sm transition-transform active:scale-95 lg:hidden"
      >
        <QrCode className="h-4 w-4" />
      </button>

      {open && (
        // Backdrop — flex column, items at bottom so sheet anchors to bottom edge
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          {/*
            Sheet:
            - max-h-[90dvh] + overflow-y-auto  → never taller than 90% of the
              visible viewport, scrollable if content somehow exceeds it
            - pb-safe                           → clears iPhone home indicator
            - rounded top corners only on mobile; full rounded on sm+
          */}
          <div
            className="relative w-full overflow-y-auto rounded-t-2xl border-t border-x border-border bg-background shadow-2xl max-h-[90dvh] sm:mx-auto sm:mb-6 sm:max-w-sm sm:rounded-2xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle pill */}
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-3">
              <h3 className="text-base font-bold">MediVault ID</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={handleClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="mx-5 mb-4 flex rounded-xl bg-muted p-1">
              {(
                [
                  { id: 'my-qr', label: 'My QR', Icon: QrCode },
                  { id: 'scan', label: 'Scan QR', Icon: ScanLine },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
                    tab === id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content — pb-safe ensures content clears home indicator */}
            <div className="px-5 pb-safe">

              {/* My QR tab */}
              {tab === 'my-qr' && (
                <div className="flex flex-col items-center gap-4 pb-6">
                  <p className="text-center text-xs text-muted-foreground">
                    Scan this so others can send you records
                  </p>
                  <div className="rounded-xl border bg-white p-3">
                    <QRCodeSVG value={address} size={200} level="M" bgColor="#ffffff" fgColor="#000000" />
                  </div>
                  <p className="break-all text-center font-mono text-xs text-muted-foreground">
                    {address}
                  </p>
                  <Button className="w-full" size="sm" onClick={() => copyAddr()}>
                    {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy address'}
                  </Button>
                  <p className="text-center text-[10px] text-muted-foreground">
                    {shortAddr}&nbsp;&middot;&nbsp;Only you can decrypt what&apos;s sent to you
                  </p>
                </div>
              )}

              {/* Scan QR tab */}
              {tab === 'scan' && (
                <div className="flex flex-col items-center gap-3 pb-6">
                  {!scanResult ? (
                    <>
                      <p className="text-center text-xs text-muted-foreground">
                        Point camera at a MediVault address QR
                      </p>

                      {cameraError ? (
                        <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                          <Camera className="mx-auto mb-2 h-8 w-8 text-destructive/50" />
                          <p className="text-xs font-medium text-destructive">{cameraError}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">Or use the photo option below.</p>
                          <Button size="sm" variant="secondary" className="mt-3 text-xs" onClick={() => void startScanner()}>
                            Try again
                          </Button>
                        </div>
                      ) : (
                        /*
                          Viewfinder:
                          - w-full fills the sheet width
                          - max-h-64 caps height on small phones so buttons
                            below remain reachable without scrolling
                          - aspect-video is gentler than aspect-square on
                            short-screen devices
                        */
                        <div className="relative w-full max-h-64 overflow-hidden rounded-xl border bg-black aspect-video">
                          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />

                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="relative h-36 w-36">
                              <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-md border-l-2 border-t-2 border-white/90" />
                              <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-md border-r-2 border-t-2 border-white/90" />
                              <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-md border-b-2 border-l-2 border-white/90" />
                              <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-md border-b-2 border-r-2 border-white/90" />
                              {scanning && (
                                <span className="absolute inset-x-3 h-0.5 animate-scan-line rounded-full bg-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                              )}
                            </div>
                          </div>

                          {!scanning && !cameraError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <p className="text-xs text-white/60">Starting camera...</p>
                            </div>
                          )}
                        </div>
                      )}

                      <label className="w-full cursor-pointer">
                        <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted active:bg-muted">
                          <Camera className="h-3.5 w-3.5 shrink-0" />
                          Scan from photo / image file
                        </div>
                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFileCapture} />
                      </label>

                      <canvas ref={canvasRef} className="hidden" />
                    </>
                  ) : (
                    <div className="flex w-full flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                        <Check className="h-6 w-6 text-green-500" />
                      </div>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">QR Scanned!</p>
                      <div className="w-full rounded-xl border bg-muted/40 px-3 py-2.5">
                        <p className="break-all font-mono text-xs text-foreground">{scanResult}</p>
                      </div>
                      <div className="flex w-full gap-2">
                        <Button className="flex-1" size="sm" onClick={() => copyAddr(scanResult)}>
                          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                          {copied ? 'Copied!' : 'Copy'}
                        </Button>
                        <Button
                          variant="secondary" size="sm" className="flex-1"
                          onClick={() => { setScanResult(null); void startScanner() }}
                        >
                          <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                          Scan again
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
