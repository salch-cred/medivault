'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import { Share2, Loader2, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useVault } from '@/lib/store'
import { storageScanUrl } from '@/lib/og/config'

export function AIChatShareAction({
  args,
}: {
  args: { recordId: string; recipientAddress: string; senderName: string }
}) {
  const { storage, address: senderAddress, records, summaries, loadSummary } = useVault()
  const [sharing, setSharing] = useState(false)
  const [shareHash, setShareHash] = useState<string | null>(null)

  const record = records.find(r => r.id === args.recordId)
  if (!record) {
    return <div className="text-sm text-destructive mt-2">Error: Record not found in vault.</div>
  }

  async function share() {
    if (!storage || !senderAddress) {
      toast.error('Wallet disconnected.')
      return
    }
    
    try {
      setSharing(true)
      
      let resolvedPubKey = ''
      const targetDoc = args.recipientAddress
      const name = args.senderName

      if (targetDoc.startsWith('0x') && targetDoc.length === 42) {
        const lookupRes = await fetch(`/api/og/pubkey?address=${encodeURIComponent(targetDoc)}`)
        if (!lookupRes.ok) {
          toast.error('Recipient has not connected to MediVault', {
            description: 'The person you are sharing with needs to connect their wallet at least once to register their secure encryption key.',
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
      
      await loadSummary(record)
      const summary = useVault.getState().summaries[record.id]

      const sharedAt = new Date().toISOString()
      
      const payload = {
        title: record.title,
        docType: record.docType,
        date: record.date,
        sharedAt,
        senderName: name,
        senderAddress,
        summary: summary ?? null,
      }
      const bytes = new TextEncoder().encode(JSON.stringify(payload))
      const { rootHash } = await storage.shareToRecipient(bytes, resolvedPubKey)
      
      const regRes = await fetch('/api/og/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress: targetDoc,
          senderName: name,
          senderAddress,
          title: record.title,
          docType: record.docType,
          date: record.date,
          sharedAt,
          rootHash,
        })
      })
      
      if (!regRes.ok) {
        throw new Error('Successfully stored on 0G, but failed to notify recipient dashboard.')
      }

      setShareHash(rootHash)
      toast.success('Record encrypted and shared securely!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setSharing(false)
    }
  }

  if (shareHash) {
    return (
      <Card className="mt-2 bg-emerald-500/10 border-emerald-500/20 shadow-none">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Check className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Successfully Shared</p>
              <a
                href={storageScanUrl(shareHash)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-emerald-600/80 hover:text-emerald-600 dark:text-emerald-400/80 hover:underline flex items-center gap-1 mt-0.5"
              >
                View on 0G Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-2 bg-card shadow-sm border-border">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-3 bg-muted/50 p-3 rounded-lg text-sm border border-border/50">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Record</span>
            <span className="font-medium">{record.title}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient</span>
            <span className="font-mono text-xs break-all">{args.recipientAddress}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared By</span>
            <span className="font-medium">{args.senderName}</span>
          </div>
        </div>
        
        <Button 
          onClick={share} 
          disabled={sharing} 
          className="w-full shadow-sm"
        >
          {sharing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Encrypting & Paying Gas...
            </>
          ) : (
            <>
              <Share2 className="mr-2 h-4 w-4" />
              Confirm & Share via Auto-Wallet
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
