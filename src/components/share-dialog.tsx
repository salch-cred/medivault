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
  const { storage } = useVault()
  const [pubKey, setPubKey] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareHash, setShareHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function share() {
    if (!storage) {
      toast.error('Connect your wallet first.')
      return
    }
    const trimmed = pubKey.trim()
    if (!trimmed) {
      toast.error('Enter the doctor’s public key.')
      return
    }
    try {
      setSharing(true)
      // Validate / normalize the recipient public key up front.
      ethers.SigningKey.computePublicKey(trimmed, true)
      // NOTE: we deliberately do NOT include meta.rootHash (the owner's
      // AES-encrypted record) — the doctor cannot decrypt it because it was
      // encrypted to the owner's vault key, not their ECIES key. Only the
      // plain-language summary is shared, ECIES-encrypted to the doctor.
      const payload = {
        title: meta.title,
        docType: meta.docType,
        date: meta.date,
        sharedAt: new Date().toISOString(),
        summary: summary ?? null,
      }
      const bytes = new TextEncoder().encode(JSON.stringify(payload))
      const { rootHash } = await storage.shareToRecipient(bytes, trimmed)
      setShareHash(rootHash)
      toast.success('Encrypted to the doctor’s key and stored on 0G')
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
          <Share2 className="h-4 w-4" /> Share to doctor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share securely with a doctor</DialogTitle>
          <DialogDescription>
            This record is re-encrypted to the doctor’s wallet public key (ECIES) and stored on
            0G. Only their private key can decrypt it — not even you can read the shared copy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pubkey">Doctor’s public key</Label>
          <Input
            id="pubkey"
            placeholder="0x04… (uncompressed or compressed secp256k1 public key)"
            value={pubKey}
            onChange={(e) => setPubKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Ask the doctor for their wallet’s public key (not their private key).
          </p>
        </div>
        {shareHash ? (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-emerald-800">Shared. Give the doctor this root hash:</p>
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
