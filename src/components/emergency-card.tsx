'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { HeartPulse, Droplet, Lock, Loader2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
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

  // Real-time PeerJS variables
  const [peerId, setPeerId] = useState<string>('')
  const [activeConnection, setActiveConnection] = useState<any>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const peerRef = useRef<any>(null)

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

  useEffect(() => {
    let active = true
    // Require a numeric PIN of at least 6 digits. Shorter/4-digit PINs have a
    // keyspace small enough to brute-force offline from the QR payload even
    // with the now-600k PBKDF2 iterations.
    const isStrongPin = /^\d{6,}$/.test(pin)
    if (!isStrongPin) {
      setEncryptedPayload(null)
      return
    }

    setIsEncrypting(true)
    encryptWithPin(qrText, pin)
      .then((payload) => {
        if (active) {
          setEncryptedPayload(payload)
          setIsEncrypting(false)
        }
      })
      .catch((e) => {
        console.error('Encryption failed:', e)
        if (active) setIsEncrypting(false)
      })

    return () => {
      active = false
    }
  }, [qrText, pin])

  // Initialize PeerJS for live approval
  useEffect(() => {
    let mounted = true
    import('peerjs').then(({ default: Peer }) => {
      if (!mounted) return
      
      // Cryptographically random peer id so the public-broker PeerJS id can't
      // be guessed/registered by an attacker to intercept or impersonate.
      const randomId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36)
      const newPeerId = 'medivault-' + randomId
      const peer = new Peer(newPeerId)
      
      peer.on('open', (id) => {
        if (mounted) setPeerId(id)
      })

      peer.on('connection', (conn) => {
        conn.on('data', (data: any) => {
          if (data && data.type === 'REQUEST_ACCESS') {
            setActiveConnection(conn)
            setShowApprovalModal(true)
          }
        })
      })

      peerRef.current = peer
    })

    return () => {
      mounted = false
      if (peerRef.current) peerRef.current.destroy()
    }
  }, [])

  const handleApproveAccess = () => {
    // In a real app, this might trigger MetaMask: `ethers.Signer.signMessage(...)`
    // For now, we simulate the "sign to unlock" intent since the payload is already local.
    if (activeConnection) {
      activeConnection.send({ type: 'APPROVED', payload: qrText })
    }
    setShowApprovalModal(false)
    setActiveConnection(null)
  }

  const handleDenyAccess = () => {
    if (activeConnection) {
      activeConnection.send({ type: 'DENIED' })
    }
    setShowApprovalModal(false)
    setActiveConnection(null)
  }

  // If no valid PIN, the QR code uses the live peer ID to request permission securely
  const qrUrl = encryptedPayload 
    ? `${window.location.origin}/scan?payload=${encryptedPayload}`
    : peerId 
      ? `${window.location.origin}/scan?peer=${peerId}` 
      : qrText

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
                  {profile.allergies.map((a) => (
                    <Badge key={a} variant="destructive">
                      {a}
                    </Badge>
                  ))}
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
                    <li key={i}>
                      {m.name} {m.dose}
                    </li>
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
                Use at least 6 digits. If no PIN is set, scanners must "Ask Permission" and you approve it live.
              </p>
            </div>

            <div className="relative rounded-2xl bg-white p-4 shadow-sm min-h-[228px] flex items-center justify-center">
              {isEncrypting || (!peerId && !encryptedPayload) ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Generating secure QR...</span>
                </div>
              ) : (
                <QRCodeCanvas value={qrUrl} size={196} includeMargin />
              )}
            </div>
            
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              {encryptedPayload 
                ? "This QR links to a secure scanner that requires your PIN to decrypt."
                : "This QR requires live permission. Scanners must request access."}
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
              Someone has scanned your Emergency QR Code and is requesting access to view your medical profile.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button onClick={handleApproveAccess} className="w-full bg-red-600 hover:bg-red-700 text-white" size="lg">
              Sign & Approve Access
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
