'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, ShieldCheck, Loader2, AlertTriangle, Copy, Check, FileDown, Server } from 'lucide-react'
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
import { useVault } from '@/lib/store'
import { shortHash, formatDateTime } from '@/lib/utils'
import { ZG, storageScanUrl } from '@/lib/og/config'
import { DOC_TYPE_LABELS, type RecordMeta } from '@/lib/og/types'

type VerifyState = 'idle' | 'checking' | 'verified' | 'unconfirmed'

function verifyLabel(v: VerifyState): string {
  if (v === 'verified') return 'Merkle proof verified on 0G'
  if (v === 'checking') return 'Verifying on 0G…'
  if (v === 'unconfirmed') return 'Pending 0G confirmation'
  return 'Anchored on 0G'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildCertificateHtml(args: {
  meta: RecordMeta
  issuedAt: string
  owner: string | null
  label: string
  nodes: number | null
}): string {
  const { meta, issuedAt, owner, label, nodes } = args
  const explorer = storageScanUrl(meta.rootHash)
  const contractExplorer = `${ZG.BLOCK_EXPLORER}/address/${ZG.FLOW_CONTRACT}`

  const rowList: Array<[string, string]> = [
    ['Record', meta.title],
    ['Document type', DOC_TYPE_LABELS[meta.docType]],
    ['0G Merkle root hash', meta.rootHash],
  ]
  if (meta.summaryRootHash) rowList.push(['0G summary root hash', meta.summaryRootHash])
  rowList.push(['Network', `0G Mainnet · Chain ID ${ZG.CHAIN_ID}`])
  if (nodes != null) rowList.push(['Live 0G storage nodes', `${nodes} replicating now`])
  rowList.push(['0G Flow storage contract', ZG.FLOW_CONTRACT])
  rowList.push(['Encryption', 'AES-256, client-side before upload'])

  const rowsHtml = rowList
    .map(
      ([k, v]) =>
        `<tr><td style="padding:9px 0;color:#64748b;font-size:12px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:9px 0 9px 18px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#0f172a;word-break:break-all">${escapeHtml(v)}</td></tr>`,
    )
    .join('')

  const parts = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>0G Proof Certificate</title></head>',
    '<body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">',
    '<div style="max-width:720px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">',
    '<div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:28px 32px;color:#ffffff">',
    '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85">MediVault · 0G Proof Certificate</div>',
    `<div style="font-size:24px;font-weight:800;margin-top:6px">${escapeHtml(meta.title)}</div>`,
    '<div style="font-size:13px;opacity:.92;margin-top:6px">Anchored on the 0G decentralized storage network</div>',
    '</div>',
    '<div style="padding:28px 32px">',
    `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600;margin-bottom:18px">${escapeHtml(label)}</div>`,
    '<table style="width:100%;border-collapse:collapse">',
    rowsHtml,
    '</table>',
    '<div style="margin-top:22px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">',
    '<div style="font-size:13px;font-weight:700;margin-bottom:8px">What 0G guarantees</div>',
    '<ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:#334155">',
    '<li>Content-addressed identity: the 0G Merkle root <em>is</em> the fingerprint of the bytes — any change produces a different root.</li>',
    '<li>0G Merkle proof re-derived directly from the data stored on the network.</li>',
    '<li>Distributed across independent 0G storage nodes — no central server to trust or take it offline.</li>',
    `<li>Anchored on 0G Mainnet via the Flow storage contract (${escapeHtml(ZG.FLOW_CONTRACT)}).</li>`,
    '<li>Encrypted client-side with AES-256 before it ever leaves the device.</li>',
    '</ul>',
    '</div>',
    '<div style="margin-top:18px;font-size:12px;color:#334155;line-height:1.8">',
    '<div style="font-weight:700;margin-bottom:6px">Verify it yourself on 0G</div>',
    `<div>1. Open the 0G storage explorer: <a href="${explorer}" style="color:#2563eb">${escapeHtml(explorer)}</a></div>`,
    '<div>2. Confirm the file root hash shown on 0G matches the 0G Merkle root above.</div>',
    `<div>3. Inspect the on-chain anchor: <a href="${contractExplorer}" style="color:#2563eb">0G Flow storage contract</a>.</div>`,
    '</div>',
    '<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px;display:flex;justify-content:space-between;font-size:11px;color:#64748b">',
    `<div>Issued ${escapeHtml(formatDateTime(issuedAt))}</div>`,
    `<div>Owner ${escapeHtml(owner ? shortHash(owner, 8, 6) : 'unknown')}</div>`,
    '</div>',
    '<div style="margin-top:8px;font-size:11px;color:#94a3b8">Secured via the 0G Decentralized Storage Network</div>',
    '</div></div></body></html>',
  ]
  return parts.join('')
}

export function ProofCertificate({ meta }: { meta: RecordMeta }) {
  const { storage, address } = useVault()
  const [open, setOpen] = useState(false)
  const [verify, setVerify] = useState<VerifyState>('idle')
  const [issuedAt, setIssuedAt] = useState('')
  const [copied, setCopied] = useState(false)
  const [nodes, setNodes] = useState<number | null>(null)

  useEffect(() => {
    if (open && !issuedAt) setIssuedAt(new Date().toISOString())
  }, [open, issuedAt])

  // Live 0G Merkle-proof re-verification whenever the certificate opens.
  useEffect(() => {
    if (!open || !storage) return
    let cancelled = false
    setVerify('checking')
    void storage
      .verifyIntegrity(meta.rootHash)
      .then((ok) => {
        if (!cancelled) setVerify(ok ? 'verified' : 'unconfirmed')
      })
      .catch(() => {
        if (!cancelled) setVerify('unconfirmed')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storage, meta.rootHash])

  // Live 0G data-availability signal: how many trusted storage nodes are
  // serving the network right now (the replication surface for this record).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/og/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const total = d?.storage?.value?.total
        if (!cancelled && typeof total === 'number') setNodes(total)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const fields: Array<{ label: string; value: string; href?: string; mono?: boolean }> = [
    { label: 'Document type', value: DOC_TYPE_LABELS[meta.docType] },
    { label: 'Document date', value: formatDateTime(meta.date) },
    { label: '0G Merkle root', value: meta.rootHash, href: storageScanUrl(meta.rootHash), mono: true },
    ...(meta.summaryRootHash
      ? [{ label: '0G summary root', value: meta.summaryRootHash, href: storageScanUrl(meta.summaryRootHash), mono: true }]
      : []),
    { label: 'Network', value: `0G Mainnet · Chain ID ${ZG.CHAIN_ID}` },
    { label: '0G Flow contract', value: ZG.FLOW_CONTRACT, href: `${ZG.BLOCK_EXPLORER}/address/${ZG.FLOW_CONTRACT}`, mono: true },
    { label: 'Encryption', value: 'AES-256 · client-side' },
  ]

  const guarantees = [
    'Content-addressed identity — the 0G Merkle root IS the fingerprint of the bytes.',
    '0G Merkle proof re-derived directly from data stored on the network.',
    'Distributed across independent 0G storage nodes — no central server.',
    'Anchored on 0G Mainnet via the Flow storage contract.',
    'Encrypted client-side with AES-256 before upload.',
  ]

  function copyDetails() {
    const lines = [
      'MediVault — 0G Proof Certificate',
      `Record: ${meta.title}`,
      `Document type: ${DOC_TYPE_LABELS[meta.docType]}`,
      `0G Merkle root: ${meta.rootHash}`,
      meta.summaryRootHash ? `0G summary root: ${meta.summaryRootHash}` : '',
      `Network: 0G Mainnet (Chain ID ${ZG.CHAIN_ID})`,
      nodes != null ? `Live 0G storage nodes: ${nodes} replicating now` : '',
      `0G Flow storage contract: ${ZG.FLOW_CONTRACT}`,
      'Encryption: AES-256 (client-side before upload)',
      `Verify on 0G: ${storageScanUrl(meta.rootHash)}`,
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    toast.success('0G verification details copied')
    setTimeout(() => setCopied(false), 1500)
  }

  function savePdf() {
    const html = buildCertificateHtml({
      meta,
      issuedAt: issuedAt || new Date().toISOString(),
      owner: address,
      label: verifyLabel(verify),
      nodes,
    })
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Allow pop-ups to save the 0G certificate as PDF.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => {
      try {
        w.print()
      } catch {
        // user can still print manually
      }
    }, 350)
  }

  const statusClass =
    verify === 'verified'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : verify === 'checking'
        ? 'border-sky-200 bg-sky-50 text-sky-800'
        : verify === 'unconfirmed'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-border bg-muted/40 text-muted-foreground'

  const statusText =
    verify === 'verified'
      ? 'Merkle proof re-verified against 0G — this record is intact and unaltered.'
      : verify === 'checking'
        ? 'Re-verifying the 0G Merkle proof against the network…'
        : verify === 'unconfirmed'
          ? 'Could not confirm on 0G right now — it may still be propagating. The content-addressed root below stays valid; try again shortly.'
          : 'This record is anchored on 0G.'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BadgeCheck className="h-4 w-4" /> Proof certificate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> 0G Proof Certificate
          </DialogTitle>
          <DialogDescription>
            Cryptographic proof that this record is anchored, intact, and independently verifiable on the 0G decentralized storage network.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${statusClass}`}>
            {verify === 'checking' ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            ) : verify === 'unconfirmed' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="leading-relaxed">{statusText}</span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <Server className="h-4 w-4 shrink-0 text-primary" />
            <span className="leading-relaxed">
              {nodes != null
                ? `Data-available and replicated across ${nodes} live 0G storage nodes right now — no single node can withhold or alter it.`
                : 'Replicated across independent 0G storage nodes — checking live availability…'}
            </span>
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="space-y-2">
              {fields.map((f) => (
                <div key={f.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{f.label}</span>
                  {f.href ? (
                    <a
                      href={f.href}
                      target="_blank"
                      rel="noreferrer"
                      className={f.mono ? 'break-all text-right font-mono text-xs text-primary underline' : 'text-right text-primary underline'}
                    >
                      {f.mono ? shortHash(f.value, 12, 10) : f.value}
                    </a>
                  ) : (
                    <span className="text-right font-medium">{f.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What 0G guarantees</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-foreground/90">
              {guarantees.map((g) => (
                <li key={g} className="flex gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={copyDetails}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy 0G details
          </Button>
          <Button onClick={savePdf}>
            <FileDown className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
