'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Link2,
  UserCheck,
  History,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useVault } from '@/lib/store'
import { buildAuthHeader } from '@/lib/client/auth'
import { shortHash, formatDateTime } from '@/lib/utils'
import { storageScanUrl } from '@/lib/og/config'
import { GENESIS_HASH, verifyConsentChain, type ConsentEvent } from '@/lib/og/ledger'

export function ConsentLedger() {
  const { address, signer } = useVault()
  const [entries, setEntries] = useState<ConsentEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const auth = await buildAuthHeader(signer, address)
      const res = await fetch(`/api/og/ledger?address=${encodeURIComponent(address)}`, {
        headers: auth ? { 'x-medivault-auth': auth } : undefined,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Could not load the consent ledger.')
      const data = await res.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [address, signer])

  useEffect(() => {
    void load()
  }, [load])

  const list = entries ?? []
  const ordered = [...list].reverse()
  const verification = verifyConsentChain(list)
  const anchored = list.length === 0 || list[0].prevHash === GENESIS_HASH

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Consent &amp; access ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every time you share a record, MediVault writes a tamper-evident entry into a hash-chained
            ledger keyed to your wallet on 0G. Each entry cryptographically commits to the one before it,
            so any edit, reorder, or deletion is detectable — and re-verified right here in your browser.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Verifying chain…
              </Badge>
            ) : verification.ok ? (
              <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Hash chain intact
              </Badge>
            ) : (
              <Badge className="gap-1 border-red-200 bg-red-50 text-red-700">
                <AlertTriangle className="h-3 w-3" /> Tamper detected at entry #{(verification.brokenAt ?? 0) + 1}
              </Badge>
            )}
            {!loading && list.length > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <History className="h-3 w-3" />
                {anchored ? `Complete history · ${list.length} events` : `${list.length} recent events`}
              </Badge>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {!loading && list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No consent events yet. When you share a record, it will be recorded here as a verifiable,
            tamper-evident entry.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ordered.map((e) => {
            const position = list.indexOf(e)
            const broken =
              !verification.ok && verification.brokenAt != null && position >= verification.brokenAt
            return (
              <Card key={e.id} className={broken ? 'border-red-200' : undefined}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          e.type === 'revoke'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        <UserCheck className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {e.type === 'revoke' ? 'Access revoked' : 'Consent granted'}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(e.ts)}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      #{position + 1}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Record</p>
                      <p className="font-medium">{e.recordTitle || 'Untitled record'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Recipient</p>
                      <p className="font-mono text-xs">{shortHash(e.recipient, 8, 6)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">0G record root</p>
                      <a
                        href={storageScanUrl(e.recordRootHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary underline"
                      >
                        {shortHash(e.recordRootHash, 8, 6)} <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entry fingerprint</p>
                      <p className="inline-flex items-center gap-1 font-mono text-xs">
                        <Link2 className="h-3 w-3 text-muted-foreground" /> {shortHash(e.entryHash, 8, 6)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
