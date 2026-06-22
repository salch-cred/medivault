'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Anchor,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useVault } from '@/lib/store'
import { buildAuthHeader } from '@/lib/client/auth'
import { txExplorerUrl } from '@/lib/og/config'
import { shortHash, formatDateTime } from '@/lib/utils'
import { buildAnchorData, parseAnchorData, type AnchorRecord } from '@/lib/og/anchor'

type VerifyState = 'idle' | 'checking' | 'match' | 'mismatch' | 'error'

export function AnchorPanel() {
  const { address, signer, autoWalletSigner, autoWalletAddress } = useVault()
  const [indexRoot, setIndexRoot] = useState<string | null>(null)
  const [anchors, setAnchors] = useState<AnchorRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [anchoring, setAnchoring] = useState(false)
  const [verifies, setVerifies] = useState<Record<string, VerifyState>>({})

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      const auth = await buildAuthHeader(signer, address)
      const headers = auth ? { 'x-medivault-auth': auth } : undefined
      const [idxRes, anchorRes] = await Promise.all([
        fetch(`/api/og/index?address=${encodeURIComponent(address)}`, { headers }),
        fetch(`/api/og/anchor?address=${encodeURIComponent(address)}`, { headers }),
      ])
      if (idxRes.ok) {
        const d = await idxRes.json()
        setIndexRoot(typeof d?.rootHash === 'string' ? d.rootHash : null)
      }
      if (anchorRes.ok) {
        const list = await anchorRes.json()
        setAnchors(Array.isArray(list) ? list.slice().reverse() : [])
      }
    } catch (e) {
      console.warn('Failed to load anchor state:', e)
    } finally {
      setLoading(false)
    }
  }, [address, signer])

  useEffect(() => {
    void load()
  }, [load])

  const latestRoot = anchors.length ? anchors[0].indexRoot : null
  const upToDate = !!indexRoot && !!latestRoot && indexRoot.toLowerCase() === latestRoot.toLowerCase()

  async function anchorNow() {
    if (!autoWalletSigner || !autoWalletAddress) {
      toast.error('Your auto-wallet is still reconnecting. Try again in a moment.')
      return
    }
    if (!indexRoot) {
      toast.error('No durable index yet. Upload a record first so the index is saved to 0G.')
      return
    }
    try {
      setAnchoring(true)
      const provider = autoWalletSigner.provider
      if (provider) {
        const bal = await provider.getBalance(autoWalletAddress)
        if (bal === 0n) {
          throw new Error('Insufficient 0G gas. Fund the auto-wallet from the status panel first.')
        }
      }
      const data = buildAnchorData(indexRoot)
      toast.message('Confirm the anchor transaction\u2026', { description: 'A tiny gas fee in OG applies.' })
      const tx = await autoWalletSigner.sendTransaction({ to: autoWalletAddress, value: 0n, data })
      toast.message('Anchoring on 0G Chain\u2026', { description: 'Waiting for confirmation.' })
      await tx.wait(1)

      const auth = await buildAuthHeader(signer, address)
      await fetch('/api/og/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-medivault-auth': auth } : {}) },
        body: JSON.stringify({ txHash: tx.hash, indexRoot }),
      })
      toast.success('Vault index anchored on 0G Chain \u2713')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not anchor the index.')
    } finally {
      setAnchoring(false)
    }
  }

  async function verifyAnchor(rec: AnchorRecord) {
    const provider = autoWalletSigner?.provider
    if (!provider) {
      toast.error('Wallet provider unavailable.')
      return
    }
    setVerifies((prev) => ({ ...prev, [rec.txHash]: 'checking' }))
    try {
      const tx = await provider.getTransaction(rec.txHash)
      if (!tx) {
        setVerifies((prev) => ({ ...prev, [rec.txHash]: 'error' }))
        return
      }
      const anchored = parseAnchorData(tx.data)
      const ok = !!anchored && anchored.toLowerCase() === rec.indexRoot.toLowerCase()
      setVerifies((prev) => ({ ...prev, [rec.txHash]: ok ? 'match' : 'mismatch' }))
    } catch (e) {
      setVerifies((prev) => ({ ...prev, [rec.txHash]: 'error' }))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Anchor className="h-4 w-4 text-primary" />
            Anchor your vault index on 0G Chain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Writes the root hash of your encrypted record index into a 0G Chain transaction, creating a
            permanent, timestamped commitment to your vault&apos;s state. Record contents stay private &mdash;
            only the encrypted index&apos;s root hash is published.
          </p>

          <div className="rounded-lg border p-3 text-sm">
            <p className="text-xs text-muted-foreground">Current durable index root</p>
            {loading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading\u2026
              </span>
            ) : indexRoot ? (
              <p className="font-mono text-sm break-all">{indexRoot}</p>
            ) : (
              <p className="text-muted-foreground">No durable index yet \u2014 upload a record first.</p>
            )}
            {!loading && indexRoot && (
              <div className="mt-2">
                {upToDate ? (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Latest index is anchored
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <ShieldAlert className="h-3 w-3" /> Current index not yet anchored
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void anchorNow()} disabled={anchoring || loading || !indexRoot || upToDate}>
              {anchoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Anchor className="mr-2 h-4 w-4" />}
              {upToDate ? 'Already anchored' : 'Anchor on 0G Chain'}
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Anchor history</CardTitle>
        </CardHeader>
        <CardContent>
          {anchors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No anchors yet.</p>
          ) : (
            <div className="space-y-2">
              {anchors.map((rec) => {
                const state = verifies[rec.txHash] || 'idle'
                return (
                  <div key={rec.txHash} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Link2 className="h-3.5 w-3.5 text-primary" />
                        {shortHash(rec.indexRoot)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(rec.anchoredAt)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a
                        href={txExplorerUrl(rec.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View tx {shortHash(rec.txHash)} <ArrowUpRight className="h-3 w-3" />
                      </a>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void verifyAnchor(rec)}>
                        {state === 'checking' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Verify on-chain
                      </Button>
                      {state === 'match' && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> Matches chain
                        </Badge>
                      )}
                      {state === 'mismatch' && <Badge variant="destructive">Mismatch</Badge>}
                      {state === 'error' && <Badge variant="outline">Tx not found yet</Badge>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
