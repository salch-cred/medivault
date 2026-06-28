'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  FileText,
  AlertTriangle,
  Pill,
  Stethoscope,
  Quote,
  Printer,
  RefreshCw,
  CloudUpload,
  CheckCircle2,
  Download,
  Clock,
  History,
  HardDrive,
  Hash,
  Copy,
  Check,
  CalendarDays,
  Syringe,
  ClipboardList,
  Leaf,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConnectGate } from '@/components/connect-gate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EncryptedBadge } from '@/components/encrypted-badge'
import { LabResultsTable } from '@/components/lab-results-table'
import { ShareDialog } from '@/components/share-dialog'
import { Disclaimer } from '@/components/disclaimer'
import { DocTypeIcon } from '@/components/doc-type-icon'
import { useVault } from '@/lib/store'
import { DOC_TYPE_LABELS, type ExtractionResult, type RecordMeta } from '@/lib/og/types'
import { formatDate, formatDateTime, formatTimeAgoExact, formatBytes, shortHash, fileKind, downloadFileName } from '@/lib/utils'
import { storageScanUrl } from '@/lib/og/config'
import { ProofCertificate } from '@/components/proof-certificate'
import { ComputeBadge } from '@/components/compute-badge'

const FADE_UP_INITIAL = { opacity: 0, y: 12 }
const FADE_IN_INITIAL = { opacity: 0 }
const FADE_ANIMATE = { opacity: 1, y: 0 }
const SCALE_INITIAL = { opacity: 0, scale: 0.98 }
const SCALE_ANIMATE = { opacity: 1, scale: 1 }
const FAST_TRANSITION = { duration: 0.2 }
const PRINT_HEADER_STYLE = { pageBreakAfter: 'avoid' } as const

type DocKind = 'text' | 'image' | 'pdf' | 'binary'

function RecordView({ meta }: { meta: RecordMeta }) {
  const { storage, summaries, loadSummary, getRecordKey, getCachedOriginal, cacheOriginal, uploadStatus, autoBackup } = useVault()
  const [summary, setSummary] = useState<ExtractionResult | undefined>(summaries[meta.id])
  const [loadingSummary, setLoadingSummary] = useState(!summaries[meta.id])
  const [summaryFailed, setSummaryFailed] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [docText, setDocText] = useState<string | null>(null)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [docKind, setDocKind] = useState<DocKind | null>(null)
  const [docStatus, setDocStatus] = useState<string | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [fileSize, setFileSize] = useState<number | null>(getCachedOriginal(meta.id)?.byteLength ?? null)
  const [copiedHash, setCopiedHash] = useState(false)
  const [, setNowTick] = useState(0)

  const backupState = uploadStatus[meta.id]
  const storageLabel =
    backupState === 'pending' ? 'Backing up to 0G…' : backupState === 'failed' ? 'Backup incomplete' : 'Stored on 0G'

  // Re-render every 30s so relative timestamps stay fresh.
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // Auto-retry the 0G backup until it succeeds — the user never has to click.
  // Runs whenever the record is mid-backup or stalled AND we still have the
  // original bytes in memory to re-upload. autoBackup() dedupes its own loop.
  useEffect(() => {
    if ((backupState === 'pending' || backupState === 'failed') && getCachedOriginal(meta.id)) {
      void autoBackup(meta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupState, meta.id])

  // Auto-verify integrity in the background as soon as the record opens. This
  // is intentionally silent: we only surface a positive result (the green
  // "verified" banner below). Transient propagation/network failures are
  // ignored so we never raise a false tamper alarm — the manual "Verify
  // integrity" button still gives full, explicit feedback on demand.
  const autoVerifiedRef = useRef(false)
  useEffect(() => {
    if (!storage || autoVerifiedRef.current) return
    autoVerifiedRef.current = true
    let cancelled = false
    void storage
      .verifyIntegrity(meta.rootHash)
      .then((ok) => {
        if (ok && !cancelled) setVerified(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, storage])

  // Release any object URL we created for previews when leaving the page.
  useEffect(() => {
    return () => {
      if (docUrl) URL.revokeObjectURL(docUrl)
    }
  }, [docUrl])

  function copyHash(h: string) {
    navigator.clipboard.writeText(h)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 1500)
  }

  async function fetchSummary() {
    setSummaryFailed(false)
    if (summaries[meta.id]) {
      setSummary(summaries[meta.id])
      setLoadingSummary(false)
      return
    }
    setLoadingSummary(true)
    const s = await loadSummary(meta)
    setSummary(s ?? undefined)
    setSummaryFailed(!s)
    setLoadingSummary(false)
  }

  useEffect(() => {
    let active = true
    async function run() {
      setSummaryFailed(false)
      if (summaries[meta.id]) {
        if (active) {
          setSummary(summaries[meta.id])
          setLoadingSummary(false)
        }
        return
      }
      if (active) setLoadingSummary(true)
      const s = await loadSummary(meta)
      if (active) {
        setSummary(s ?? undefined)
        setSummaryFailed(!s)
        setLoadingSummary(false)
      }
    }
    void run()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id])

  function retryBackup() {
    setBackingUp(true)
    toast.message('Retrying 0G backup — it will keep trying automatically until it succeeds.')
    void autoBackup(meta)
    setTimeout(() => setBackingUp(false), 1500)
  }

  async function verify() {
    if (!storage) return
    setVerifying(true)
    setVerifyStatus(null)
    try {
      const ok = await storage.verifyIntegrity(meta.rootHash, (m) => setVerifyStatus(m))
      setVerified(ok)
      toast[ok ? 'success' : 'error'](
        ok ? 'Integrity verified against 0G' : 'Integrity check failed',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verify failed')
    } finally {
      setVerifying(false)
      setVerifyStatus(null)
    }
  }

  // Turn decrypted bytes into a preview: decode text inline, or build a typed
  // object URL so PDFs/images open and download natively. We also write the
  // bytes back into the in-memory cache so re-opening this record is instant.
  function presentBytes(bytes: Uint8Array) {
    cacheOriginal(meta.id, bytes)
    setFileSize(bytes.byteLength)
    const kind = fileKind(meta.mimeType)
    if (kind === 'text') {
      setDocText(new TextDecoder().decode(bytes))
      setDocUrl(null)
      setDocKind('text')
      return
    }
    const blob = new Blob([bytes as BlobPart], meta.mimeType ? { type: meta.mimeType } : undefined)
    setDocUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(blob)
    })
    setDocText(null)
    setDocKind(kind)
  }

  async function viewOriginal() {
    if (!storage) return
    // Fast path: the original bytes were cached locally at upload time, so the
    // just-uploaded record renders instantly with zero network round-trips.
    const cached = getCachedOriginal(meta.id)
    if (cached) {
      presentBytes(cached)
      return
    }
    const recKey = await getRecordKey(meta)
    if (!recKey) return
    setLoadingDoc(true)
    setDocStatus(null)
    try {
      const bytes = await storage.downloadDecrypted(meta.rootHash, recKey, (m) =>
        setDocStatus(m),
      )
      presentBytes(bytes)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('file not found') || /no locations|not found/i.test(msg)) {
        toast.error('File not found on the 0G network. It may still be propagating, or the record was created on a different 0G network. Please try again in a minute.')
      } else {
        toast.error(msg || 'Could not load original document')
      }
    } finally {
      setLoadingDoc(false)
      setDocStatus(null)
    }
  }

  async function saveOriginalFile() {
    if (!storage) return
    let bytes = getCachedOriginal(meta.id)
    if (!bytes) {
      const recKey = await getRecordKey(meta)
      if (!recKey) return
      setLoadingDoc(true)
      setDocStatus('Fetching original from 0G…')
      try {
        bytes = await storage.downloadDecrypted(meta.rootHash, recKey, (m) => setDocStatus(m))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(msg || 'Could not download original')
        setLoadingDoc(false)
        setDocStatus(null)
        return
      }
      setLoadingDoc(false)
      setDocStatus(null)
    }
    if (!bytes) return
    cacheOriginal(meta.id, bytes)
    setFileSize(bytes.byteLength)
    try {
      const blob = new Blob([bytes as BlobPart], meta.mimeType ? { type: meta.mimeType } : undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadFileName(meta.title, meta.fileName, meta.mimeType)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Original file downloaded')
    } catch {
      toast.error('Download failed')
    }
  }

  function OriginalPreview() {
    if (docKind === 'image' && docUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={docUrl} alt={meta.title} className="max-h-[480px] w-auto rounded-xl border" />
    }
    if (docKind === 'pdf' && docUrl) {
      return (
        <object data={docUrl} type="application/pdf" className="h-[480px] w-full rounded-xl border">
          <a href={docUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open PDF in a new tab</a>
        </object>
      )
    }
    if (docKind === 'binary' && docUrl) {
      return (
        <div className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">
          Preview isn’t available for this file type. <a href={docUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open in a new tab</a> or use Save file.
        </div>
      )
    }
    return (
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs">
        {docText || '(empty document)'}
      </pre>
    )
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>

        <motion.div
          initial={FADE_UP_INITIAL}
          animate={FADE_ANIMATE}
          className="flex flex-wrap items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <DocTypeIcon type={meta.docType} withTone />
            <div>
              <h1 className="text-2xl font-bold">{meta.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{DOC_TYPE_LABELS[meta.docType]}</Badge>
                <span className="text-sm text-muted-foreground">{formatDateTime(meta.date)}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Added {formatTimeAgoExact(meta.createdAt)}
              </div>
              <div className="mt-2">
                <EncryptedBadge rootHash={meta.rootHash} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={saveOriginalFile} disabled={loadingDoc} variant="outline">
              {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download original
            </Button>
            <Button onClick={() => window.print()} variant="outline">
              <Printer className="h-4 w-4" />
              Export PDF
            </Button>
            <Button onClick={verify} disabled={verifying} variant="outline">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verify integrity
            </Button>
            <ProofCertificate meta={meta} />
            <ShareDialog meta={meta} summary={summary} />
          </div>
        </motion.div>

        {backupState === 'pending' ? (
          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> Backing up to 0G decentralized storage… auto-retrying until it’s permanently saved. You can keep using your vault.
          </div>
        ) : backupState === 'stored' ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Backed up to 0G decentralized storage.
          </div>
        ) : backupState === 'failed' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Finishing your 0G backup — retrying automatically.
            <Button onClick={retryBackup} disabled={backingUp} variant="outline" size="sm" className="h-6 px-2 text-xs">
              {backingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry now
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" /> Record details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Document date</span>
                <span className="text-right font-medium">{formatDateTime(meta.date)}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Added to vault</span>
                <span className="text-right font-medium">{formatTimeAgoExact(meta.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><CloudUpload className="h-3.5 w-3.5" /> Storage</span>
                <Badge variant={backupState === 'failed' ? 'destructive' : 'secondary'}>{storageLabel}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> File size</span>
                <span className="text-right font-medium">{fileSize != null ? formatBytes(fileSize) : 'Open original to measure'}</span>
              </div>
              {meta.fileName ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Original file</span>
                  <span className="max-w-[55%] truncate text-right font-medium" title={meta.fileName}>{meta.fileName}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Hash className="h-3.5 w-3.5" /> 0G root hash</span>
                <span className="flex items-center gap-1.5">
                  <a href={storageScanUrl(meta.rootHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline">{shortHash(meta.rootHash, 8, 6)}</a>
                  <button onClick={() => copyHash(meta.rootHash)} className="text-muted-foreground hover:text-foreground">{copiedHash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </span>
              </div>
              {meta.summaryRootHash ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Hash className="h-3.5 w-3.5" /> Summary hash</span>
                  <a href={storageScanUrl(meta.summaryRootHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline">{shortHash(meta.summaryRootHash, 8, 6)}</a>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" /> Activity timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border pl-4">
                <li className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium">Added to your vault</p>
                  <p className="text-xs text-muted-foreground">{formatTimeAgoExact(meta.createdAt)}</p>
                </li>
                {meta.date ? (
                  <li className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
                    <p className="text-sm font-medium">Document dated</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(meta.date)}</p>
                  </li>
                ) : null}
                <li className="relative">
                  <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${backupState === 'failed' ? 'bg-amber-500' : backupState === 'pending' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <p className="text-sm font-medium">{backupState === 'failed' ? 'Finishing backup…' : backupState === 'pending' ? 'Backing up to 0G…' : 'Secured on 0G network'}</p>
                  <p className="text-xs text-muted-foreground">{backupState === 'pending' ? 'In progress' : backupState === 'failed' ? 'Retrying automatically' : 'Encrypted & distributed across storage nodes'}</p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {verifying && verifyStatus ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {verifyStatus}
          </div>
        ) : null}

        {verified !== null ? (
          <motion.div
            initial={SCALE_INITIAL}
            animate={SCALE_ANIMATE}
            className={
              verified
                ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'
            }
          >
            {verified
              ? 'This record’s Merkle root matches 0G — it has not been tampered with.'
              : 'The integrity check did not pass. The stored data may be unavailable or still propagating — try again in a minute.'}
          </motion.div>
        ) : null}

        {loadingSummary ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Decrypting summary…
          </div>
        ) : summary ? (
          <Tabs defaultValue="explanation">
            <TabsList>
              <TabsTrigger value="explanation">Explanation</TabsTrigger>
              <TabsTrigger value="data">Extracted data</TabsTrigger>
              <TabsTrigger value="original">Original</TabsTrigger>
            </TabsList>

            <TabsContent value="explanation">
              <motion.div initial={FADE_IN_INITIAL} animate={FADE_ANIMATE} transition={FAST_TRANSITION} className="space-y-4 pt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-primary" /> Plain-language summary
                      <Badge variant="outline">confidence {Math.round(summary.confidence * 100)}%</Badge>
                      <ComputeBadge className="ml-auto" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">
                    {summary.plainLanguageSummary || 'No summary text was produced.'}
                  </CardContent>
                </Card>

                {summary.redFlags.length ? (
                  <Card className="border-amber-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base text-amber-700">
                        <AlertTriangle className="h-4 w-4" /> Things to ask your doctor
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {summary.redFlags.map((r, i) => (
                        <div key={i} className="rounded-lg bg-amber-50 p-3 text-sm">
                          <div className="flex items-center gap-2 font-medium text-amber-800">
                            {r.issue}
                            <Badge variant="warning" className="capitalize">{r.severity}</Badge>
                          </div>
                          {r.suggestion ? <p className="mt-1 text-amber-700">{r.suggestion}</p> : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                {summary.sourceQuotes.length ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Quote className="h-4 w-4 text-primary" /> Source quotes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {summary.sourceQuotes.map((q, i) => (
                        <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground">
                          “{q.quote}” {q.supports ? <span className="text-xs">— {q.supports}</span> : null}
                        </blockquote>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </motion.div>
            </TabsContent>

            <TabsContent value="data">
              <motion.div initial={FADE_IN_INITIAL} animate={FADE_ANIMATE} transition={FAST_TRANSITION} className="space-y-4 pt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Lab results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LabResultsTable results={summary.labResults} />
                  </CardContent>
                </Card>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Stethoscope className="h-4 w-4 text-primary" /> Conditions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {summary.conditions.length ? (
                        summary.conditions.map((c, i) => (
                          <div key={i}>
                            <span className="font-medium">{c.name}</span>
                            {c.status ? ` — ${c.status}` : ''}
                            {c.note ? <p className="text-muted-foreground">{c.note}</p> : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">None found.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Pill className="h-4 w-4 text-primary" /> Medications
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {summary.medications.length ? (
                        summary.medications.map((m, i) => (
                          <div key={i}>
                            <span className="font-medium">{m.name}</span>
                            {m.dose ? ` · ${m.dose}` : ''}
                            {m.frequency ? ` · ${m.frequency}` : ''}
                            {m.purpose ? <p className="text-muted-foreground">{m.purpose}</p> : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">None found.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {summary.allergies?.length ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Syringe className="h-4 w-4 text-primary" /> Allergies
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {summary.allergies.map((a, i) => (
                        <Badge key={i} variant="warning">{a}</Badge>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                {summary.remedies?.length ? (
                  <Card className="border-emerald-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
                        <Leaf className="h-4 w-4" /> Suggested remedies & self-care
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1.5 pl-5 text-sm">
                        {summary.remedies.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}

                {summary.followUps?.length ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ClipboardList className="h-4 w-4 text-primary" /> Follow-ups
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {summary.followUps.map((f, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
                          <div>
                            <p className="font-medium">{f.action}</p>
                            {f.byDate ? <p className="text-xs text-muted-foreground">By {formatDate(f.byDate)}</p> : null}
                          </div>
                          <Badge variant={f.priority === 'high' ? 'destructive' : f.priority === 'medium' ? 'warning' : 'secondary'} className="capitalize">{f.priority}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </motion.div>
            </TabsContent>

            <TabsContent value="original">
              <motion.div initial={FADE_IN_INITIAL} animate={FADE_ANIMATE} transition={FAST_TRANSITION} className="pt-4">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    {docKind === null ? (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={viewOriginal} disabled={loadingDoc} variant="outline">
                          {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          Download & decrypt original
                        </Button>
                        <Button onClick={saveOriginalFile} disabled={loadingDoc} variant="outline">
                          <Download className="h-4 w-4" /> Save file
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{fileSize != null ? `${formatBytes(fileSize)} decrypted locally` : 'Decrypted locally'}</p>
                          <Button onClick={saveOriginalFile} variant="outline" size="sm">
                            <Download className="h-4 w-4" /> Save file
                          </Button>
                        </div>
                        <OriginalPreview />
                      </>
                    )}
                    {loadingDoc && docStatus ? (
                      <p className="text-xs text-muted-foreground">{docStatus}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Decrypted locally with your wallet-derived key. PDFs and images open in their original format.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="space-y-3 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {summaryFailed ? 'Could not decrypt the AI summary.' : 'No AI summary is available for this record.'}
              </div>
              <p>
                The original encrypted record still exists at the 0G root hash above. This can happen if the summary upload is still propagating, the network is slow, or the record was created while the app was pointed at a different 0G network.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={fetchSummary} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4" /> Retry summary
                </Button>
                <Button onClick={viewOriginal} disabled={loadingDoc} variant="outline" size="sm">
                  {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Decrypt original
                </Button>
                <Button onClick={saveOriginalFile} disabled={loadingDoc} variant="outline" size="sm">
                  <Download className="h-4 w-4" /> Save file
                </Button>
              </div>
              {loadingDoc && docStatus ? (
                <p className="text-xs text-amber-800">{docStatus}</p>
              ) : null}
              {docKind !== null ? <OriginalPreview /> : null}
            </CardContent>
          </Card>
        )}

        <Disclaimer />
      </div>

      {summary && (
        <div className="hidden print:block print:bg-white print:text-black">
          <div className="mb-8 border-b-4 border-neutral-900 pb-6" style={PRINT_HEADER_STYLE}>
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-black tracking-tight uppercase">MediVault</h1>
                <p className="text-sm font-semibold text-neutral-600 mt-1 uppercase tracking-widest">Official Medical Record</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-black">Date: {formatDateTime(meta.date)}</p>
                <p className="text-sm text-black">Type: {DOC_TYPE_LABELS[meta.docType]}</p>
                <p className="text-sm text-black">Added: {formatDateTime(meta.createdAt)}</p>
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-black">{meta.title}</h2>
          </div>
          <div className="space-y-8 pb-6">
            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Clinical Summary</h3>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-black">
                {summary.plainLanguageSummary || 'No summary available.'}
              </p>
            </section>
            {summary.labResults && summary.labResults.length > 0 && (
              <section>
                <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Lab Results</h3>
                <table className="w-full border-collapse text-left text-base text-black">
                  <thead>
                    <tr className="border-b-2 border-black">
                      <th className="py-2 px-2 font-bold">Test</th>
                      <th className="py-2 px-2 font-bold">Value</th>
                      <th className="py-2 px-2 font-bold text-neutral-600">Reference</th>
                      <th className="py-2 px-2 font-bold">Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {summary.labResults.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 px-2 font-semibold">{l.test}</td>
                        <td className="py-2 px-2">{l.value} {l.unit}</td>
                        <td className="py-2 px-2 text-neutral-600">{l.referenceRange}</td>
                        <td className="py-2 px-2">{l.flag !== 'normal' ? <span className="font-bold uppercase text-black">{l.flag}</span> : 'Normal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <footer className="mt-12 pt-4 border-t border-neutral-300 text-xs text-neutral-500 flex justify-between items-start">
              <div>
                <p className="font-bold text-black">Generated by MediVault</p>
                <p>Secured via 0G Decentralized Network</p>
              </div>
              <div className="text-right max-w-[50%]">
                <p className="font-bold text-black">0G Verification Root Hash:</p>
                <p className="font-mono break-all">{meta.rootHash}</p>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

export default function RecordDetailPage({ params }: { params: { id: string } }) {
  const { records } = useVault()
  const meta = records.find((r) => r.id === params.id)
  return (
    <ConnectGate>
      {meta ? (
        <RecordView meta={meta} />
      ) : (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Record not found in your loaded vault. Go back and let your records finish loading.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/vault">Back to vault</Link>
          </Button>
        </div>
      )}
    </ConnectGate>
  )
}
