'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldAlert, Lock, AlertCircle, HeartPulse, ArrowLeft, Loader2, Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { decryptWithPin } from '@/lib/pin-crypto'
import Link from 'next/link'

function ScanInner() {
  const searchParams = useSearchParams()
  const peerId = searchParams.get('peer')
  
  const [payload, setPayload] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [decryptedText, setDecryptedText] = useState<string | null>(null)
  
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [peerStatus, setPeerStatus] = useState<'idle' | 'connecting' | 'waiting_approval' | 'denied' | 'approved'>('idle')
  const peerConnRef = useRef<any>(null)
  const peerStatusRef = useRef<typeof peerStatus>('idle')

  // Keep a ref in sync so async event handlers (which close over stale state)
  // can read the latest status. Previously conn.on('close') captured the
  // initial 'idle' value, so the "connection closed" branch misfired.
  useEffect(() => {
    peerStatusRef.current = peerStatus
  }, [peerStatus])

  useEffect(() => {
    // Read the encrypted payload from the `?payload=` query param — the value
    // the QR generator (emergency-card.tsx) actually emits. The `#payload=`
    // fragment is kept as a fallback for any legacy links.
    const fromQuery = searchParams.get('payload')
    if (fromQuery) {
      setPayload(fromQuery)
      return
    }
    const hash = window.location.hash
    if (hash.startsWith('#payload=')) {
      setPayload(hash.replace('#payload=', ''))
    }
  }, [searchParams])

  const handleUnlockWithPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payload || !pin) return

    setIsDecrypting(true)
    setError('')

    try {
      const text = await decryptWithPin(payload, pin)
      setDecryptedText(text)
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN or corrupted data')
    } finally {
      setIsDecrypting(false)
    }
  }

  const handleRequestLiveAccess = async () => {
    if (!peerId) return
    setPeerStatus('connecting')
    setError('')

    try {
      const { default: Peer } = await import('peerjs')
      const peer = new Peer()

      peer.on('open', () => {
        const conn = peer.connect(peerId)
        peerConnRef.current = conn

        conn.on('open', () => {
          setPeerStatus('waiting_approval')
          conn.send({ type: 'REQUEST_ACCESS' })
        })

        conn.on('data', (data: any) => {
          if (data && data.type === 'APPROVED') {
            setPeerStatus('approved')
            setDecryptedText(data.payload)
            peer.destroy()
          } else if (data && data.type === 'DENIED') {
            setPeerStatus('denied')
            setError('The owner denied your request for access.')
            peer.destroy()
          }
        })

        conn.on('close', () => {
          if (peerStatusRef.current !== 'approved' && peerStatusRef.current !== 'denied') {
            setError('Connection closed by owner.')
            setPeerStatus('idle')
          }
        })
      })
    } catch (e) {
      setError('Failed to connect to the owner device.')
      setPeerStatus('idle')
    }
  }

  if (error && !payload && peerStatus !== 'denied') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-500/20 bg-red-500/5">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-red-500">Error</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/">Return to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (decryptedText) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
        <div className="w-full max-w-2xl mt-8">
          <Button asChild variant="ghost" className="mb-6 -ml-4 text-muted-foreground">
            <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Scanner</Link>
          </Button>

          <Card className="border-red-500/20 shadow-xl shadow-red-500/5">
            <CardHeader className="border-b border-border/50 bg-red-500/5 pb-6">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <HeartPulse className="h-6 w-6 text-red-500" /> Emergency Profile
              </CardTitle>
              <CardDescription className="text-base">
                This is a critical medical profile. Verify information with the patient or a clinician if possible.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                {decryptedText}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Live Permission Mode
  if (peerId && !payload) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Card className="border-border/50 shadow-xl overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-emerald-500 to-emerald-400" />
            <CardHeader className="text-center space-y-4 pt-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <Fingerprint className="h-8 w-8 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-2xl">Live Permission Required</CardTitle>
                <CardDescription>
                  This QR code requires active approval from the owner. You must request access to view their emergency data.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pb-8 space-y-4">
              {peerStatus === 'waiting_approval' ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <p>Waiting for the owner to sign and approve your request on their device...</p>
                </div>
              ) : peerStatus === 'denied' ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center text-red-500">
                  <AlertCircle className="h-8 w-8" />
                  <p className="font-medium">{error}</p>
                </div>
              ) : (
                <Button 
                  onClick={handleRequestLiveAccess} 
                  className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
                  disabled={peerStatus === 'connecting'}
                >
                  {peerStatus === 'connecting' ? 'Connecting...' : 'Request Access'}
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  // PIN Mode
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        <Card className="border-border/50 shadow-xl overflow-hidden">
          <div className="h-2 w-full bg-gradient-to-r from-primary to-accent" />
          <CardHeader className="text-center space-y-4 pt-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ShieldAlert className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">Encrypted Profile</CardTitle>
              <CardDescription>
                This QR code contains an encrypted medical profile. Please enter the PIN to unlock it.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-8">
            <form onSubmit={handleUnlockWithPin} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="Enter PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="pl-10 h-12 text-center text-xl tracking-[0.2em]"
                    minLength={6}
                    maxLength={12}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-red-500 text-center font-medium">{error}</p>}
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold"
                disabled={!pin || isDecrypting}
              >
                {isDecrypting ? 'Decrypting...' : 'Unlock Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <ScanInner />
    </Suspense>
  )
}
