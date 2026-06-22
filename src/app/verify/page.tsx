'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  FileText,
  Clock,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { decodeProof, verifyProof } from '@/lib/og/disclosure'
import type { DisclosureProof } from '@/lib/og/disclosure'
import { storageScanUrl } from '@/lib/og/config'
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import { shortHash, formatDateTime } from '@/lib/utils'

function VerifyInner() {
  const params = useSearchParams()
  const [raw, setRaw] = useState('')

  useEffect(() => {
    const p = params.get('p')
    if (p) setRaw(p)
  }, [params])

  const proof: DisclosureProof | null = useMemo(() => (raw ? decodeProof(raw) : null), [raw])
  const result = useMemo(() => (proof ? verifyProof(proof) : null), [proof])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Verify a MediVault proof</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a selective-disclosure proof token below. Verification happens entirely in your browser.
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste proof token here"
            className="h-24 w-full resize-none rounded-lg border bg-muted/40 p-2.5 font-mono text-xs"
          />
        </CardContent>
      </Card>

      {raw && !proof && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4" /> This token could not be read. Check that it was copied in full.
          </CardContent>
        </Card>
      )}

      {proof && result && (
        <Card className={result.valid ? 'border-emerald-500/50' : 'border-destructive/50'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {result.valid ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Valid signed proof</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <span className="text-destructive">Could not verify</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.valid && result.reason && (
              <p className="text-sm text-destructive">{result.reason}</p>
            )}

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Disclosed details</p>
              <div className="space-y-2">
                {proof.claim.fields.map((f, i) => (
                  <div key={f.label + i} className="rounded-lg border p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                    <p className="text-sm">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Signed by</p>
                <p className="font-mono text-sm">{shortHash(result.recovered || '')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source record</p>
                <p className="flex items-center gap-1 text-sm">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  {proof.claim.recordTitle}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Document type</p>
                <p className="text-sm">{DOC_TYPE_LABELS[proof.claim.docType]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Issued</p>
                <p className="text-sm">{formatDateTime(proof.claim.issuedAt)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {proof.claim.expiresAt ? 'Expires ' + formatDateTime(proof.claim.expiresAt) : 'No expiry'}
              </Badge>
              {result.expired && <Badge variant="destructive">Expired</Badge>}
            </div>

            <a
              href={storageScanUrl(proof.claim.recordRootHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View the source record on 0G storage ({shortHash(proof.claim.recordRootHash)})
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 text-center">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          MediVault &middot; medical records on 0G
        </Link>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  )
}
