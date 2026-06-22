'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BadgeCheck,
  Loader2,
  Copy,
  Check,
  FileText,
  ShieldCheck,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVault } from '@/lib/store'
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import type { DisclosedField, DisclosureClaim } from '@/lib/og/disclosure'
import { claimMessage, encodeProof } from '@/lib/og/disclosure'
import { storageScanUrl } from '@/lib/og/config'
import { shortHash } from '@/lib/utils'

export function ProofBuilder() {
  const { records, summaries, loadSummary, signer, address } = useVault()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [expiryDays, setExpiryDays] = useState('30')
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [signing, setSigning] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<'token' | 'link' | null>(null)

  const selected = records.find((r) => r.id === selectedId) || null
  const summary = selectedId ? summaries[selectedId] : undefined

  async function pickRecord(id: string) {
    setSelectedId(id)
    setPicked({})
    setToken(null)
    if (!summaries[id]) {
      const meta = records.find((r) => r.id === id)
      if (meta) {
        setLoadingSummary(true)
        try {
          await loadSummary(meta)
        } finally {
          setLoadingSummary(false)
        }
      }
    }
  }

  const candidates: DisclosedField[] = useMemo(() => {
    if (!summary) return []
    const out: DisclosedField[] = []
    if (summary.date) out.push({ label: 'Document date', value: summary.date })
    for (const a of summary.allergies || []) out.push({ label: 'Allergy', value: a })
    for (const m of summary.medications || []) {
      const value = [m.name, m.dose, m.frequency].filter(Boolean).join(' \u00b7 ')
      if (value) out.push({ label: 'Medication', value })
    }
    for (const c of summary.conditions || []) {
      const value = [c.name, c.status].filter(Boolean).join(' \u2014 ')
      if (value) out.push({ label: 'Condition', value })
    }
    for (const l of summary.labResults || []) {
      const measure = (l.value + ' ' + l.unit).trim()
      const flag = l.flag && l.flag !== 'unknown' ? ' (' + l.flag + ')' : ''
      out.push({ label: 'Lab: ' + l.test, value: measure + flag })
    }
    return out
  }, [summary])

  const selectedCount = candidates.filter((_, i) => picked[String(i)]).length

  async function generate() {
    if (!signer || !address || !selected) {
      toast.error('Connect your wallet to sign a proof.')
      return
    }
    const fields = candidates.filter((_, i) => picked[String(i)])
    if (fields.length === 0) {
      toast.error('Select at least one detail to disclose.')
      return
    }
    try {
      setSigning(true)
      const days = parseInt(expiryDays, 10)
      const expiresAt =
        Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 86400000).toISOString()
          : null
      const nonceBytes = new Uint8Array(8)
      crypto.getRandomValues(nonceBytes)
      const nonce = Array.from(nonceBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      const claim: DisclosureClaim = {
        v: 1,
        issuer: address.toLowerCase(),
        recordTitle: selected.title,
        docType: selected.docType,
        recordRootHash: selected.rootHash,
        fields,
        issuedAt: new Date().toISOString(),
        expiresAt,
        nonce,
      }
      const signature = await signer.signMessage(claimMessage(claim))
      setToken(encodeProof({ claim, signature }))
      toast.success('Signed disclosure proof created.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign the proof.')
    } finally {
      setSigning(false)
    }
  }

  function verifyLink(): string {
    if (!token) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin + '/verify?p=' + token
  }

  async function copy(kind: 'token' | 'link') {
    try {
      const text = kind === 'token' ? token || '' : verifyLink()
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
      toast.success(kind === 'token' ? 'Proof token copied.' : 'Verification link copied.')
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheck className="h-4 w-4 text-primary" />
            Create a selective-disclosure proof
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reveal only the details you choose from one record. The proof is cryptographically signed by your
            wallet and bound to the record&apos;s 0G root hash, so anyone can verify it came from you &mdash;
            without seeing the rest of your record.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">1 &middot; Choose a record</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet. Upload a document first.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {records.map((r) => (
                <button
                  key={r.id}
                  onClick={() => void pickRecord(r.id)}
                  className={
                    'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ' +
                    (selectedId === r.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50')
                  }
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{DOC_TYPE_LABELS[r.docType]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">2 &middot; Choose what to reveal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSummary ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading record details&hellip;
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">This record has no structured details to disclose.</p>
            ) : (
              <div className="space-y-2">
                {candidates.map((c, i) => (
                  <label
                    key={c.label + i}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={!!picked[String(i)]}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [String(i)]: e.target.checked }))}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-muted-foreground">{c.label}</span>
                      <span className="block text-sm">{c.value}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor="expiry" className="text-xs">Valid for (days, 0 = no expiry)</Label>
                <Input
                  id="expiry"
                  type="number"
                  min="0"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="h-9 w-44"
                />
              </div>
              <Button onClick={() => void generate()} disabled={signing || selectedCount === 0}>
                {signing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Sign proof ({selectedCount})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {token && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">3 &middot; Share your proof</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Signed
              </Badge>
              <span className="text-xs text-muted-foreground">
                Bound to 0G root {shortHash(selected?.rootHash || '')}
              </span>
            </div>
            <textarea
              readOnly
              value={token}
              className="h-28 w-full resize-none rounded-lg border bg-muted/40 p-2.5 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void copy('token')}>
                {copied === 'token' ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                Copy token
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void copy('link')}>
                {copied === 'link' ? <Check className="mr-2 h-3.5 w-3.5" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
                Copy verification link
              </Button>
              <Link href={'/verify?p=' + token} target="_blank" className="inline-flex">
                <Button variant="outline" size="sm">
                  <ArrowUpRight className="mr-2 h-3.5 w-3.5" /> Open verifier
                </Button>
              </Link>
            </div>
            {selected?.rootHash && (
              <a
                href={storageScanUrl(selected.rootHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View record on 0G storage explorer <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
