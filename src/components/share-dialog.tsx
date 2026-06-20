'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import { Share2, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVault } from '@/lib/store'
import { shortHash } from '@/lib/utils'
import { storageScanUrl } from '@/lib/og/config'
import type { ExtractionResult, RecordMeta } from '@/lib/og/types'

export function ShareDialog({
  meta,
  summary,
}: {
  meta: RecordMeta
  summary?: ExtractionResult
}) {
  const { storage, address: senderAddress } = useVault()
  const [doctorInput, setDoctorInput] = useState('')
  const [senderName, setSenderName] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareHash, setShareHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function share() {
    if (!storage || !senderAddress) {
      toast.error('Connect your wallet first.')
      return
    }
    const targetDoc = doctorInput.trim()
    const name = senderName.trim()
    if (!targetDoc) {
      toast.error('Enter the doctor’s wallet address.')
      return
    }
    if (!name) {
      toast.error('Enter your name so the doctor knows who sent it.')
      return
    }
    try {
      setSharing(true)
      
      let resolvedPubKey = ''
      
      // If it looks like a wallet address (42 chars, starts with 0x)
      if (targetDoc.startsWith('0x') && targetDoc.length === 42) {
        const lookupRes = await fetch(`/api/og/pubkey?address=${encodeURIComponent(targetDoc)}`)
        if (!lookupRes.ok) {
          throw new Error('This doctor address has not registered their public key yet. They need to connect their wallet to MediVault first.')
        }
        const data = await lookupRes.json()
        resolvedPubKey = data.publicKey
      } else {
        resolvedPubKey = targetDoc
      }
      
      // Validate / normalize the recipient public key up front.
      ethers.SigningKey.computePublicKey(resolvedPubKey, true)
      
      const sharedAt = new Date().toISOString()
      
      const payload = {
        title: meta.title,
        docType: meta.docType,
        date: meta.date,
        sharedAt,
        senderName: name,
        senderAddress,
        summary: summary ?? null,
      }
      const bytes = new TextEncoder().encode(JSON.stringify(payload))
      const { rootHash } = await storage.shareToRecipient(bytes, resolvedPubKey)
      
      // Register share event on the backend registry so it shows in doctor's dashboard
      const regRes = await fetch('/api/og/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress: targetDoc,
          senderName: name,
          senderAddress,
          title: meta.title,
          docType: meta.docType,
          date: meta.date,
          sharedAt,
          rootHash,
        })
      })
      
      if (!regRes.ok) {
        throw new Error('Successfully stored on 0G, but failed to notify doctor dashboard.')
      }

      setShareHash(rootHash)
      toast.success('Encrypted securely and shared directly to the doctor’s dashboard!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setSharing(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 className="h-4 w-4" /> Share record
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share securely with family, friends, or doctors</DialogTitle>
          <DialogDescription>
            Re-encrypts this record securely to the recipient’s key and posts it directly to their dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senderName">Your Name</Label>
            <Input
              id="senderName"
              placeholder="e.g., Maria Khan"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctorAddress">Recipient’s Wallet Address</Label>
            <Input
              id="doctorAddress"
              placeholder="0x… (EVM wallet address of family, friend, or doctor)"
              value={doctorInput}
              onChange={(e) => setDoctorInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter the recipient's wallet address. They must have connected to MediVault at least once.
            </p>
          </div>
        </div>
        {shareHash ? (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-emerald-800">Shared! Secure root hash on 0G:</p>
            <div className="flex items-center gap-2">
              <a
                href={storageScanUrl(shareHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-emerald-700 underline"
              >
                {shortHash(shareHash, 10, 8)}
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareHash)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
                className="text-emerald-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <Button onClick={share} disabled={sharing}>
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Encrypt & share
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
