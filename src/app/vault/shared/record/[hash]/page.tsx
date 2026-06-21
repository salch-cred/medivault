'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  Printer,
  User,
  Mail,
  Calendar,
  Clock,
  Pill,
  Stethoscope,
  Quote,
  FileText,
  Download,
  Hash,
  History,
  HardDrive,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Leaf,
  ClipboardList,
  Syringe,
} from 'lucide-react'
import { toast } from 'sonner'
import { ethers } from 'ethers'

import { useVault } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocTypeIcon } from '@/components/doc-type-icon'
import { EncryptedBadge } from '@/components/encrypted-badge'
import { Disclaimer } from '@/components/disclaimer'
import { LabResultsTable } from '@/components/lab-results-table'
import { DOC_TYPE_LABELS, type ExtractionResult } from '@/lib/og/types'
import { formatDate, formatDateTime, formatTimeAgoExact, formatBytes, shortHash, fileKind, downloadFileName } from '@/lib/utils'
import { storageScanUrl } from '@/lib/og/config'
import { eciesDecrypt, type EciesEnvelope } from '@/lib/og/ecies'
import { buildAuthHeader } from '@/lib/client/auth'

const FADE_UP_INITIAL = { opacity: 0, y: 12 }
const FADE_ANIMATE = { opacity: 1, y: 0 }
const PRINT_HEADER_STYLE = { pageBreakAfter: 'avoid' } as const

type DocKind = 'text' | 'image' | 'pdf' | 'binary'

type SharedPayload = {
  title: string
  docType: string
  date: string | null
  sharedAt: string
  senderName: string
  senderAddress: string
  summary: ExtractionResult | null
  recordRootHash?: string
  recordKeySalt?: string | null
  recordKeyHex?: string
  fileName?: string | null
  mimeType?: string | null
}

export default function SharedRecordPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { storage, autoWalletSigner, importReceivedRecord, signer, address: walletAddress } = useVault()

  const hash = params.hash as string
  const senderNameParam = searchParams.get('senderName') || 'Unknown Patient'
  const senderAddressParam = searchParams.get('senderAddress') || '0x'

  const [loading, setLoading] = useState(true)
  const [decryptedData, setDecryptedData] = useState<SharedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [docText, setDocText] = useState<string | null>(null)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [docKind, setDocKind] = useState<DocKind | null>(null)
  const [docStatus, setDocStatus] = useState<string | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [, setNowTick] = useState(0)

  // Decrypted original bytes, kept so the manual Save button never re-downloads.
  const originalBytesRef = useRef<Uint8Array | null>(null)
  // Ensures the auto-load + vault-import runs exactly once per opened share.
  const autoStartedRef = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

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

  // Turn decrypted bytes into a preview: decode text inline, or build a typed
  // object URL so PDFs/images open and download in their native format.
  function presentBytes(bytes: Uint8Array, mime?: string | null) {
    originalBytesRef.current = bytes
    setFileSize(bytes.byteLength)
    const kind = fileKind(mime)
    if (kind === 'text') {
      setDocText(new TextDecoder().decode(bytes))
      setDocUrl(null)
      setDocKind('text')
    } else {
      const blob = new Blob([bytes as BlobPart], mime ? { type: mime } : undefined)
      setDocUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
      setDocText(null)
      setDocKind(kind)
    }
  }

  useEffect(() => {
    let active = true
    async function decryptRecord() {
      if (!storage || !autoWalletSigner) {
        setLoading(false)
        return
      }

      try {
        const wallet = autoWalletSigner as ethers.Wallet
        const privateKey = wallet.privateKey
        if (!privateKey) {
          throw new Error('Auto-Wallet private key not loaded')
        }

        // Build auth header for the share-envelope API (now requires auth).
        const auth = await buildAuthHeader(signer, walletAddress)

        // ── Fast path ───────────────────────────────────────────
        // The sender also stashes a self-contained, client-side-encrypted copy
        // of this exact payload in the instant KV layer (keyed by the 0G root
        // hash). Reading it takes ~1s and never waits on 0G propagation, which
        // is what produced the “still registering on the 0G network” error. The
        // blob is ECIES-encrypted to THIS wallet, so the server never sees
        // plaintext. If it is missing (older shares) we fall back to 0G below.
        if (active) setStatus('Fetching your secure record…')
        try {
          const r = await fetch(
            `/api/og/share-envelope?hash=${encodeURIComponent(hash)}`,
            { headers: auth ? { 'x-medivault-auth': auth } : undefined },
          )
          if (r.ok) {
            const data = (await r.json()) as { envelope?: EciesEnvelope }
            if (data?.envelope) {
              if (active) setStatus('Decrypting securely on your device…')
              const fast = await eciesDecrypt(privateKey, data.envelope)
              const payload = JSON.parse(new TextDecoder().decode(fast)) as SharedPayload
              if (active) setDecryptedData(payload)
              return
            }
          }
        } catch (fastErr) {
          console.warn('Instant share path unavailable, falling back to 0G:', fastErr)
        }

        // Warm up 0G node/indexer selection so the fallback download (and the
        // auto original-file fetch) starts from a hot path.
        void storage.prewarm?.()

        // Fallback: downloadDecryptedShared is patient-by-default: it waits
        // (fast 3s polling, ~90s budget) for the just-shared file to propagate
        // across the 0G indexer, reporting live status, instead of failing fast.
        const bytes = await storage.downloadDecryptedShared(
          hash,
          privateKey,
          (m) => {
            if (active) setStatus(m)
          },
        )

        const payload = JSON.parse(new TextDecoder().decode(bytes)) as SharedPayload
        if (active) setDecryptedData(payload)
      } catch (err: any) {
        console.error('Shared decryption failed:', err)
        if (!active) return
        const msg = err?.message?.toLowerCase() || ''
        if (
          msg.includes('file not found') ||
          msg.includes('no locations found') ||
          msg.includes('not found') ||
          msg.includes('no location')
        ) {
          setError('Document is still registering on the 0G network, or has been pruned. Please wait a moment or ask the sender to re-share.')
        } else {
          setError(err?.message || 'Could not decrypt shared record.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    decryptRecord()
    return () => {
      active = false
    }
  }, [hash, storage, autoWalletSigner, signer, walletAddress])

  // ── Auto-ready + save-forever ────────────────────────────────────
  // As soon as the record is decrypted, automatically download + decrypt the
  // ORIGINAL file (so it is on-screen and ready with no clicks) and import it
  // into THIS wallet's own vault permanently — re-encrypted under the
  // recipient's own key and backed up to their 0G index. After this, the shared
  // document stays in their wallet forever and opens instantly from their vault.
  useEffect(() => {
    if (!decryptedData) return
    if (autoStartedRef.current) return
    const rootHash = decryptedData.recordRootHash
    const keyHex = decryptedData.recordKeyHex
    if (!rootHash || !keyHex) return // summary-only share: nothing to auto-load
    autoStartedRef.current = true

    let active = true
    ;(async () => {
      try {
        if (!storage) return
        setLoadingDoc(true)
        setDocStatus('Preparing your document…')
        const recKey = ethers.getBytes(keyHex)
        const bytes = await storage.downloadDecrypted(
          rootHash,
          recKey,
          (m) => {
            if (active) setDocStatus(m)
          },
          { expectExists: true },
        )
        if (!active) return
        presentBytes(bytes, decryptedData.mimeType)

        // Save into the recipient's own vault, permanently.
        try {
          const id = await importReceivedRecord({
            shareHash: hash,
            payload: {
              title: decryptedData.title,
              docType: decryptedData.docType,
              date: decryptedData.date,
              fileName: decryptedData.fileName ?? null,
              mimeType: decryptedData.mimeType ?? null,
            },
            originalBytes: bytes,
            summary: decryptedData.summary,
          })
          if (active && id) setSavedId(id)
        } catch (impErr) {
          console.warn('Could not save shared record to your vault:', impErr)
        }
      } catch (e) {
        // Original not ready yet — the manual buttons remain available to retry.
        console.warn('Auto-load of original failed (user can retry):', e)
      } finally {
        if (active) {
          setLoadingDoc(false)
          setDocStatus(null)
        }
      }
    })()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decryptedData])

  async function loadOriginal(saveToDisk: boolean) {
    if (!storage || !decryptedData) return
    const rootHash = decryptedData.recordRootHash
    const keyHex = decryptedData.recordKeyHex
    if (!rootHash || !keyHex) {
      toast.error('The sender shared only the summary, not the original file.')
      return
    }
    let bytes = originalBytesRef.current
    if (!bytes) {
      setLoadingDoc(true)
      setDocStatus('Fetching original from 0G…')
      try {
        const recKey = ethers.getBytes(keyHex)
        bytes = await storage.downloadDecrypted(rootHash, recKey, (m) => setDocStatus(m), { expectExists: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(msg || 'Could not load the original document')
        setLoadingDoc(false)
        setDocStatus(null)
        return
      }
      setLoadingDoc(false)
      setDocStatus(null)
    }
    presentBytes(bytes, decryptedData.mimeType)

    if (saveToDisk) {
      try {
        const mime = decryptedData.mimeType
        const blob = new Blob([bytes as BlobPart], mime ? { type: mime } : undefined)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = downloadFileName(decryptedData.title, decryptedData.fileName, mime)
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success('Original file downloaded')
      } catch {
        toast.error('Download failed')
      }
    }
  }

  function OriginalPreview() {
    if (docKind === 'image' && docUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={docUrl} alt={decryptedData?.title || 'Shared document'} className="max-h-[480px] w-auto rounded-xl border" />
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

  if (loading) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-semibold">Downloading & decrypting secure record...</p>
        <p className="text-xs text-muted-foreground mt-2 max-w-[280px]">
          {status || 'Securely fetching this record from the 0G decentralized network…'}
        </p>
      </div>
    )
  }

  if (error || !decryptedData) {
    return (
      <div className="space-y-6">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold text-destructive">Decryption Error</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error || 'Could not load record. Ensure your connected wallet address matches the recipient address.'}</p>
            <Button onClick={() => router.push('/vault')} className="mt-4" variant="outline">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { title, docType, date, sharedAt, senderName, senderAddress, summary } = decryptedData
  const hasOriginal = Boolean(decryptedData.recordRootHash && decryptedData.recordKeyHex)

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto print:hidden">
      <div className="print:hidden">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
      </div>

      <motion.div
        initial={FADE_UP_INITIAL}
        animate={FADE_ANIMATE}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <DocTypeIcon type={docType as any} withTone />
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{(DOC_TYPE_LABELS as any)[docType] || docType}</Badge>
              <span className="text-sm text-muted-foreground">Document date: {formatDateTime(date)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Shared {formatTimeAgoExact(sharedAt)}
            </div>
            <div className="mt-2">
              <EncryptedBadge rootHash={hash} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {hasOriginal ? (
            <Button onClick={() => loadOriginal(true)} disabled={loadingDoc} variant="outline">
              {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download original
            </Button>
          ) : null}
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </motion.div>

      {savedId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved to your vault — this document now stays in your wallet permanently and opens instantly.
          <Link href={`/vault/record/${savedId}`} className="font-medium underline">Open in my vault</Link>
        </div>
      ) : hasOriginal ? (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving this document to your vault so it stays with you forever…
        </div>
      ) : null}

      {/* Patient / Sender Information */}
      <Card className="border-neutral-800 bg-neutral-950/40">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Shared by</p>
              <p className="text-sm font-semibold">{senderName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sender wallet address</p>
              <p className="text-sm font-mono">{shortHash(senderAddress, 10, 8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="text-sm font-semibold">{formatTimeAgoExact(sharedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Record details + Activity timeline */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" /> Record details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Document date</span>
              <span className="text-right font-medium">{formatDateTime(date)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Shared</span>
              <span className="text-right font-medium">{formatTimeAgoExact(sharedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Original file</span>
              <span className="max-w-[55%] truncate text-right font-medium" title={decryptedData.fileName || undefined}>{decryptedData.fileName ? decryptedData.fileName : fileSize != null ? formatBytes(fileSize) : hasOriginal ? 'Available' : 'Summary only'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Hash className="h-3.5 w-3.5" /> Shared root hash</span>
              <span className="flex items-center gap-1.5">
                <a href={storageScanUrl(hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline">{shortHash(hash, 8, 6)}</a>
                <button onClick={() => copyHash(hash)} className="text-muted-foreground hover:text-foreground">{copiedHash ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </span>
            </div>
            {decryptedData.recordRootHash ? (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Hash className="h-3.5 w-3.5" /> Source doc hash</span>
                <a href={storageScanUrl(decryptedData.recordRootHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline">{shortHash(decryptedData.recordRootHash, 8, 6)}</a>
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
              {date ? (
                <li className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
                  <p className="text-sm font-medium">Document dated</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(date)}</p>
                </li>
              ) : null}
              <li className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">Shared with you by {senderName}</p>
                <p className="text-xs text-muted-foreground">{formatTimeAgoExact(sharedAt)}</p>
              </li>
              <li className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <p className="text-sm font-medium">Decrypted on your device</p>
                <p className="text-xs text-muted-foreground">Just now · end-to-end encrypted via 0G</p>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {summary ? (
        <Tabs defaultValue="explanation" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="explanation">Clinical explanation</TabsTrigger>
            <TabsTrigger value="data">Structured data</TabsTrigger>
          </TabsList>

          <TabsContent value="explanation" className="pt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" /> Clinical overview
                  {typeof summary.confidence === 'number' ? <Badge variant="outline">confidence {Math.round(summary.confidence * 100)}%</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{summary.plainLanguageSummary || 'No summary text available.'}</p>
              </CardContent>
            </Card>

            {summary.redFlags?.length ? (
              <Card className="border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Things to ask a doctor
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

            {summary.sourceQuotes?.length ? (
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
          </TabsContent>

          <TabsContent value="data" className="space-y-6 pt-4">
            {summary.labResults?.length ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Lab results</CardTitle>
                </CardHeader>
                <CardContent>
                  <LabResultsTable results={summary.labResults} />
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Stethoscope className="h-4 w-4 text-primary" /> Conditions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {summary.conditions?.length ? (
                    summary.conditions.map((c, i) => (
                      <div key={i}>
                        <span className="font-medium">{c.name}</span>
                        {c.status ? ` — ${c.status}` : ''}
                        {c.note ? <p className="text-muted-foreground">{c.note}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">None recorded.</p>
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
                  {summary.medications?.length ? (
                    summary.medications.map((m, i) => (
                      <div key={i}>
                        <span className="font-medium">{m.name}</span>
                        {m.dose ? ` · ${m.dose}` : ''}
                        {m.frequency ? ` · ${m.frequency}` : ''}
                        {m.purpose ? <p className="text-muted-foreground">{m.purpose}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">None recorded.</p>
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
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-emerald-400">
                    <Leaf className="h-4 w-4" /> Recommended remedies & care
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-300">
                    {summary.remedies.map((r, i) => (
                      <li key={i} className="leading-relaxed">{r}</li>
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
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">No shared extraction data available.</p>
      )}

      {hasOriginal ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Original document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {docKind === null ? (
              loadingDoc ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {docStatus || 'Preparing your document…'}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => loadOriginal(false)} disabled={loadingDoc} variant="outline">
                    {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    View original
                  </Button>
                  <Button onClick={() => loadOriginal(true)} disabled={loadingDoc} variant="outline">
                    <Download className="h-4 w-4" /> Save file
                  </Button>
                </div>
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{fileSize != null ? `${formatBytes(fileSize)} decrypted locally` : 'Decrypted locally'}</p>
                  <Button onClick={() => loadOriginal(true)} variant="outline" size="sm">
                    <Download className="h-4 w-4" /> Save file
                  </Button>
                </div>
                <OriginalPreview />
              </>
            )}
            {loadingDoc && docStatus && docKind !== null ? <p className="text-xs text-muted-foreground">{docStatus}</p> : null}
            <p className="text-xs text-muted-foreground">Decrypted locally with the key the sender shared. PDFs and images open in their original format.</p>
          </CardContent>
        </Card>
      ) : null}

      <Disclaimer />
      </div>

      {summary && (
        <div className="hidden print:block print:bg-white print:text-black">
          {/* Header section with a clean, classic medical look */}
          <div className="mb-8 border-b-4 border-neutral-900 pb-6" style={PRINT_HEADER_STYLE}>
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-black tracking-tight uppercase">MediVault</h1>
                <p className="text-sm font-semibold text-neutral-600 mt-1 uppercase tracking-widest">Shared Medical Record</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-black">Date: {formatDateTime(date)}</p>
                <p className="text-sm text-black uppercase tracking-wider">Shared by: {senderName}</p>
                <p className="text-sm text-black">Shared: {formatDateTime(sharedAt)}</p>
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-black">{title}</h2>
          </div>
          
          <div className="space-y-8 pb-6">
            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Clinical Summary</h3>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-black">
                {summary.plainLanguageSummary || 'No summary available.'}
              </p>
            </section>

            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Extracted Clinical Data</h3>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Conditions & Diagnoses</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                    {summary.conditions?.length ? summary.conditions.map((c, i) => (
                      <li key={i}>{c.name} {c.status && `(${c.status})`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Active Medications</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text:black space-y-1">
                    {summary.medications?.length ? summary.medications.map((m, i) => (
                      <li key={i}>{m.name} {m.dose && `- ${m.dose}`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
              </div>
            </section>

            {summary.remedies?.length ? (
              <section>
                <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Recommended Remedies & Care</h3>
                <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                  {summary.remedies.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {summary.labResults?.length ? (
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
                        <td className="py-2 px-2">
                          {l.flag && l.flag !== 'normal' ? <span className="font-bold uppercase text-black">{l.flag}</span> : 'Normal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            <footer className="mt-12 pt-4 border-t border-neutral-300 text-xs text-neutral-500 flex justify-between items-start">
              <div>
                <p className="font-bold text-black">Generated by MediVault</p>
                <p>Secured via 0G Decentralized Network</p>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
