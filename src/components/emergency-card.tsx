'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { HeartPulse, Droplet, Lock, Loader2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useVault } from '@/lib/store'
import { buildEmergencyProfile } from '@/lib/health'
import type { VaultRecord } from '@/lib/og/types'
import { encryptWithPin } from '@/lib/pin-crypto'

export function EmergencyCard({ records }: { records: VaultRecord[] }) {
  const { emergency, setBloodType, address } = useVault()
  const profile = useMemo(() => buildEmergencyProfile(records), [records])

  const [pin, setPin] = useState('')
  const [encryptedPayload, setEncryptedPayload] = useState<string | null>(null)
  const [isEncrypting, setIsEncrypting] = useState(false)

  // Safe client-only origin — avoids SSR window crash
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  // PeerJS live-approval state
  const [peerId, setPeerId] = useState<string>('')
  const [peerReady, setPeerReady] = useState(false)   // true once PeerJS opens OR timeout fires
  const [activeConnection, setActiveConnection] = useState<unknown>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const peerRef = useRef<{ destroy(): void } | null>(null)

  const qrText = useMemo(() => {
    const lines = [
      'MEDIVAULT EMERGENCY CARD',
      emergency.bloodType ? `Blood type: ${emergency.bloodType}` : null,
      profile.allergies.length ? `Allergies: ${profile.allergies.join(', ')}` : 'Allergies: none recorded',
      profile.medications.length
        ? `Meds: ${profile.medications.map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`).join('; ')}`
        : 'Meds: none recorded',
      profile.conditions.length
        ? `Conditions: ${profile.conditions.map((c) => c.name).join(', ')}`
        : 'Conditions: none recorded',
      address ? `Wallet: ${address}` : null,
      'Not medical advice. Verify with patient/clinician.',
    ].filter(Boolean)
    return lines.join('\n')
  }, [emergency.bloodType, profile, address])

  // PIN-based encryption
  useEffect(() => {
    let active = true
    const isStrongPin = /^\d{6,}$/.test(pin)
    if (!isStrongPin) { setEncryptedPayload(null); return }
    setIsEncrypting(true)
    encryptWithPin(qrText, pin)
      .then((payload) => { if (active) { setEncryptedPayload(payload); setIsEncrypting(false) } })
      .catch((e) => { console.error('Encryption failed:', e); if (active) setIsEncrypting(false) })
    return () => { active = false }
  }, [qrText, pin])

  // PeerJS — 3 s timeout so the QR never stays a spinner forever
  useEffect(() => {
    let mounted = true
    // Fallback: if PeerJS hasn't opened within 3 s, show the plain-text QR anyway
    const fallbackTimer = setTimeout(() => { if (mounted) setPeerReady(true) }, 3000)

    import('peerjs')
      .then(({ default: Peer }) => {
        if (!mounted) return
        const randomId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36)
        const peer = new Peer('medivault-' + randomId)
        peer.on('open', (id: string) => {
          if (mounted) { setPeerId(id); setPeerReady(true) }
        })
        peer.on('error', () => { if (mounted) setPeerReady(true) })
        peer.on('connection', (conn: any) => {
          conn.on('data', (data: any) => {
            if (data?.type === 'REQUEST_ACCESS') {
              setActiveConnection(conn)
              setShowApprovalModal(true)
            }
          })
        })
        peerRef.current = peer
      })
      .catch(() => { if (mounted) setPeerReady(true) })

    return () => {
      mounted = false
      clearTimeout(fallbackTimer)
      peerRef.current?.destroy()
    }
  }, [])

  const handleApproveAccess = () => {
    if (activeConnection) (activeConnection as any).send({ type: 'APPROVED', payload: qrText })
    setShowApprovalModal(false)
    setActiveConnection(null)
  }

  const handleDenyAccess = () => {
    if (activeConnection) (activeConnection as any).send({ type: 'DENIED' })
    setShowApprovalModal(false)
    setActiveConnection(null)
  }

  // Build the QR value — only after origin is known (client-side)
  const qrValue = useMemo(() => {
    if (!origin) return qrText          // SSR / hydration — plain text is safe
    if (encryptedPayload) return `${origin}/scan?payload=${encryptedPayload}`
    if (peerId) return `${origin}/scan?peer=${peerId}`
    return qrText                       // PeerJS failed / timed out — plain text
  }, [origin, encryptedPayload, peerId, qrText])

  // Show spinner only while actively encrypting OR waiting for PeerJS (max 3 s)
  const showSpinner = isEncrypting || (!peerReady && !encryptedPayload)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-red-500" /> Emergency profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blood" className="flex items-center gap-1">
                <Droplet className="h-4 w-4 text-red-500" /> Blood type
              </Label>
              <Input
                id="blood"
                placeholder="e.g. O+"
                value={emergency.bloodType}
                onChange={(e) => setBloodType(e.target.value)}
                className="max-w-[120px]"
              />
            </div>
            <div>
              <p className="text-sm font-medium">Allergies</p>
              {profile.allergies.length ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {profile.allergies.map((a) => <Badge key={a} variant="destructive">{a}</Badge>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">None recorded</p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Key medications</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {profile.medications.length ? (
                  profile.medications.slice(0, 6).map((m, i) => (
                    <li key={i}>{m.name} {m.dose}</li>
                  ))
                ) : (
                  <li>None recorded</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Conditions</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {profile.conditions.length ? (
                  profile.conditions.slice(0, 6).map((c, i) => <li key={i}>{c.name}</li>)
                ) : (
                  <li>None recorded</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan in an emergency</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="w-full space-y-2 max-w-xs bg-muted/30 p-4 rounded-xl border border-border/50">
              <Label htmlFor="pin" className="flex items-center gap-1 text-sm font-medium">
                <Lock className="h-4 w-4 text-primary" /> Secure with PIN (optional)
              </Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="\d*"
                placeholder="Enter 6+ digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                minLength={6}
                maxLength={12}
                className="bg-background"
              />
              <p className="text-[10px] text-muted-foreground">
                6+ digits. Without a PIN, scanners must request live permission.
              </p>
            </div>

            <div className="relative rounded-2xl bg-white p-4 shadow-sm min-h-[228px] w-full max-w-xs flex items-center justify-center">
              {showSpinner ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Generating QR…</span>
                </div>
              ) : (
                <QRCodeCanvas value={qrValue} size={196} includeMargin />
              )}
            </div>

            <p className="max-w-xs text-center text-xs text-muted-foreground">
              {encryptedPayload
                ? 'This QR links to a secure scanner — PIN required to decrypt.'
                : peerId
                ? 'This QR requires live permission. Scanners must request access.'
                : 'Scan this code in an emergency for instant medical info.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-red-500">
              <AlertTriangle className="h-5 w-5" /> Access Request
            </DialogTitle>
            <DialogDescription className="text-base pt-2 text-foreground">
              Someone has scanned your Emergency QR and is requesting access to your medical profile.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button onClick={handleApproveAccess} className="w-full bg-red-600 hover:bg-red-700 text-white" size="lg">
              Sign &amp; Approve Access
            </Button>
            <Button onClick={handleDenyAccess} variant="outline" className="w-full" size="lg">
              Deny
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
