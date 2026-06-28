'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  FileText,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Hash,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { decodeProof, verifyProof } from '@/lib/og/disclosure'
import type { DisclosureProof } from '@/lib/og/disclosure'
import { storageScanUrl } from '@/lib/og/config'
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import { shortHash, formatDateTime } from '@/lib/utils'

// ── Root-hash checker ─────────────────────────────────────────────────────────

type CheckResult = {
  ok: boolean
  label: string
  detail: string
}

type VerifyResponse = {
  rootHash: string
  checks: Record<string, CheckResult>
  links: { storageExplorer: string | null; blockExplorer: string | null }
  verifiedAt: string
  error?: string
}

function RootHashChecker() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerifyResponse | null>(null)

  const run = useCallback(async () => {
    const hash = input.trim()
    if (!hash) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/og/verify?rootHash=${encodeURIComponent(hash)}`)
      const data: VerifyResponse = await res.json()
      setResult(data)
    } catch {
      setResult({
        rootHash: hash,
        checks: {},
        links: { storageExplorer: null, blockExplorer: null },
        verifiedAt: '',
        error: 'Network error — please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [input])

  const allOk =
    result &&
    !result.error &&
    Object.values(result.checks).length > 0 &&
    Object.values(result.checks).every((c) => c.ok)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            Enter a MediVault record root hash (0x…) to verify it exists on 0G
            Network.
          </p>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder="0x1a2b3c4d…64 hex chars"
              className="flex-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={run}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Verify'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result?.error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {result.error}
          </CardContent>
        </Card>
      )}

      {result && !result.error && (
        <Card
          className={allOk ? 'border-emerald-500/50' : 'border-amber-500/50'}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {allOk ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Verified on 0G Network
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    Partial verification
                  </span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.values(result.checks).map((c) => (
              <div key={c.label} className="flex items-start gap-3">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p
                    className={`text-sm font-medium ${
                      c.ok ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {c.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            ))}

            {result.links.storageExplorer && (
              <a
                href={result.links.storageExplorer}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View on 0G Storage Explorer{' '}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}

            {result.verifiedAt && (
              <p className="text-xs text-muted-foreground">
                Verified at {new Date(result.verifiedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Proof-token verifier (existing) ──────────────────────────────────────────

function ProofVerifier() {
  const params = useSearchParams()
  const [raw, setRaw] = useState('')

  useEffect(() => {
    const p = params.get('p')
    if (p) setRaw(p)
  }, [params])

  const proof: DisclosureProof | null = useMemo(
    () => (raw ? decodeProof(raw) : null),
    [raw],
  )
  const result = useMemo(
    () => (proof ? verifyProof(proof) : null),
    [proof],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">
            Paste a selective-disclosure proof token. Verification happens
            entirely in your browser.
          </p>
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
            <ShieldAlert className="h-4 w-4" /> This token could not be read.
            Check that it was copied in full.
          </CardContent>
        </Card>
      )}

      {proof && result && (
        <Card
          className={result.valid ? 'border-emerald-500/50' : 'border-destructive/50'}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {result.valid ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Valid signed proof
                  </span>
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
                    <p className="text-xs font-medium text-muted-foreground">
                      {f.label}
                    </p>
                    <p className="text-sm">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Signed by</p>
                <p className="font-mono text-sm">
                  {shortHash(result.recovered || '')}
                </p>
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
                <p className="text-sm">
                  {DOC_TYPE_LABELS[proof.claim.docType]}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Issued</p>
                <p className="text-sm">
                  {formatDateTime(proof.claim.issuedAt)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {proof.claim.expiresAt
                  ? 'Expires ' + formatDateTime(proof.claim.expiresAt)
                  : 'No expiry'}
              </Badge>
              {result.expired && (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>

            <a
              href={storageScanUrl(proof.claim.recordRootHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View source record on 0G ({shortHash(proof.claim.recordRootHash)})
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'rootHash' | 'proof'

function VerifyInner() {
  const [tab, setTab] = useState<Tab>('rootHash')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Verify on 0G</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check any MediVault record against the 0G Network — no account
          needed.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-lg border p-1">
        <button
          onClick={() => setTab('rootHash')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'rootHash'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Hash className="h-4 w-4" /> Root Hash
        </button>
        <button
          onClick={() => setTab('proof')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'proof'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldCheck className="h-4 w-4" /> Proof Token
        </button>
      </div>

      {tab === 'rootHash' && <RootHashChecker />}
      {tab === 'proof' && <ProofVerifier />}

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
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
