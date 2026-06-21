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
import { eciesEncrypt } from '@/lib/og/ecies'
import { buildAuthHeader } from '@/lib/client/auth'
import type { ExtractionResult, RecordMeta } from '@/lib/og/types'

export function ShareDialog({
  meta,
  summary,
}: {
  meta: RecordMeta
  summary?: ExtractionResult
}) {
  const {
    storage,
    address: senderAddress,
    signer,
    getRecordKey,
    backupRecord,
    uploadStatus,
  } = useVault()
  const [doctorInput, setDoctorInput] = useState('')
  const [senderName, setSenderName] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareHash, setShareHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function ensureOriginalIsDurable(): Promise<boolean> {
    if (!storage || !meta.rootHash) return false

    // If this session already marked the record as stored, avoid an unnecessary
    // 0G proof/read check and proceed immediately.
    if (uploadStatus[meta.id] === 'stored') return true

    toast.message('Checking that the original file is ready on 0G…')

    // First, try to prove the root is already retrievable. This covers refreshed
    // sessions where local uploadStatus is empty but the record is durable.
    try {
      const ok = await storage.verifyIntegrity(meta.rootHash, undefined, {
        expectExists: true,
      })
      if (ok) return true
    } catch (verifyErr) {
      console.warn('0G readiness check failed before share:', verifyErr)
    }

    // If not yet retrievable, finish the pending backup from the locally cached
    // original bytes. backupRecord returns false if the original bytes are no
    // longer in memory, in which case the user should re-upload/open the file
    // before sharing.
    toast.message('Finishing the 0G backup before sharing…')
    return backupRecord(meta)
  }

  async function share() {
    if (!storage || !senderAddress) {
      toast.error('Connect your wallet first.')
      return
    }
    const targetDoc = doctorInput.trim()
    const name = senderName.trim()
    if (!targetDoc) {
      toast.error('Enter the recipient wallet address.')
      return
    }
    if (!name) {
      toast.error('Enter your name so the recipient knows who sent it.')
      return
    }
    try {
      setSharing(true)
      const auth = await buildAuthHeader(signer, senderAddress)
      if (!auth) throw new Error('Wallet signature is required to share securely.')

      let resolvedPubKey = ''

      if (targetDoc.startsWith('0x') && targetDoc.length === 42) {
        const lookupRes = await fetch(
          `/api/og/pubkey?address=${encodeURIComponent(targetDoc)}`,
          { headers: { 'x-medivault-auth': auth } },
        )
        if (!lookupRes.ok) {
          toast.error('Recipient has not connected to MediVault', {
            description: 'The person you are sharing with needs to open MediVault and connect their wallet at least once to register their secure encryption key. Once they do, you can share files with them!',
          })
          setSharing(false)
          return
        }
        const data = await lookupRes.json()
        resolvedPubKey = data.publicKey
      } else {
        resolvedPubKey = targetDoc
      }

      ethers.SigningKey.computePublicKey(resolvedPubKey, true)

      const originalReady = await ensureOriginalIsDurable()
      if (!originalReady) {
        throw new Error(
          'This record is still finishing its secure 0G backup. Keep this page open and try sharing again in a moment.',
        )
      }

      const recKey = await getRecordKey(meta)
      if (!recKey) {
        toast.error('Could not derive the record decryption key.')
        setSharing(false)
        return
      }

      const sharedAt = new Date().toISOString()
      const payload = {
        title: meta.title,
        docType: meta.docType,
        date: meta.date,
        sharedAt,
        senderName: name,
        senderAddress,
        summary: summary ?? null,
        recordRootHash: meta.rootHash,
        recordKeySalt: meta.recordKeySalt ?? null,
        recordKeyHex: ethers.hexlify(recKey),
        fileName: meta.fileName ?? null,
        mimeType: meta.mimeType ?? null,
      }
      const bytes = new TextEncoder().encode(JSON.stringify(payload))

      const { rootHash, durable } = await storage.shareToRecipient(bytes, resolvedPubKey)

      let kvOk = false
      try {
        const envelope = await eciesEncrypt(resolvedPubKey, bytes)
        const envRes = await fetch('/api/og/share-envelope', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-medivault-auth': auth,
          },
          body: JSON.stringify({ hash: rootHash, envelope }),
        })
        kvOk = envRes.ok
      } catch (cacheErr) {
        console.warn('Fast-path envelope cache failed:', cacheErr)
      }

      if (!durable && !kvOk) {
        throw new Error(
          'Could not deliver this share right now — the 0G network is busy and the instant channel is unreachable. Your record is safe; please try again in a moment.',
        )
      }

      const regRes = await fetch('/api/og/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-medivault-auth': auth,
        },
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
        throw new Error('Shared securely, but failed to notify the recipient dashboard. They can still open it from a share link.')
      }

      setShareHash(rootHash)
      toast.success(
        durable
          ? 'Encrypted securely and shared directly to the recipient dashboard!'
          : 'Shared instantly to the recipient — the permanent 0G copy is finishing in the background.',
      )
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
            Re-encrypts this record securely to the recipient key and posts it directly to their dashboard.
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
            <Label htmlFor="doctorAddress">Recipient Wallet Address</Label>
            <Input
              id="doctorAddress"
              placeholder="0x... (EVM wallet address of family, friend, or doctor)"
              value={doctorInput}
              onChange={(e) => setDoctorInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter the recipient wallet address. They must have connected to MediVault at least once.
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
