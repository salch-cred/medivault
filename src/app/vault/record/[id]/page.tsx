'use client'

import { useEffect, useState } from 'react'
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
import { formatDate } from '@/lib/utils'

const FADE_UP_INITIAL = { opacity: 0, y: 12 }
const FADE_IN_INITIAL = { opacity: 0 }
const FADE_ANIMATE = { opacity: 1, y: 0 }
const SCALE_INITIAL = { opacity: 0, scale: 0.98 }
const SCALE_ANIMATE = { opacity: 1, scale: 1 }
const FAST_TRANSITION = { duration: 0.2 }
const PRINT_HEADER_STYLE = { pageBreakAfter: 'avoid' } as const

function RecordView({ meta }: { meta: RecordMeta }) {
  const { storage, summaries, loadSummary, getRecordKey, getCachedOriginal, uploadStatus, backupRecord } = useVault()
  const [summary, setSummary] = useState<ExtractionResult | undefined>(summaries[meta.id])
  const [loadingSummary, setLoadingSummary] = useState(!summaries[meta.id])
  const [summaryFailed, setSummaryFailed] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [docText, setDocText] = useState<string | null>(null)
  const [docStatus, setDocStatus] = useState<string | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  const backupState = uploadStatus[meta.id]

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

  async function retryBackup() {
    setBackingUp(true)
    try {
      const ok = await backupRecord(meta)
      toast[ok ? 'success' : 'error'](ok ? 'Backed up to 0G ✓' : 'Backup failed — please try again.')
    } finally {
      setBackingUp(false)
    }
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

  async function viewOriginal() {
    if (!storage) return
    // Fast path: the original bytes were cached locally at upload time, so the
    // just-uploaded record renders instantly with zero network round-trips.
    const cached = getCachedOriginal(meta.id)
    if (cached) {
      setDocText(new TextDecoder().decode(cached))
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
      setDocText(new TextDecoder().decode(bytes))
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
                <span className="text-sm text-muted-foreground">{formatDate(meta.date)}</span>
              </div>
              <div className="mt-2">
                <EncryptedBadge rootHash={meta.rootHash} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={() => window.print()} variant="outline">
              <Printer className="h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={verify} disabled={verifying} variant="outline">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verify integrity
            </Button>
            <ShareDialog meta={meta} summary={summary} />
          </div>
        </motion.div>

        {backupState === 'pending' ? (
          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> Backing up to 0G decentralized storage in the background… You can keep using your vault.
          </div>
        ) : backupState === 'stored' ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Backed up to 0G decentralized storage.
          </div>
        ) : backupState === 'failed' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <AlertTriangle className="h-3.5 w-3.5" /> The 0G backup didn’t finish.
            <Button onClick={retryBackup} disabled={backingUp} variant="outline" size="sm" className="h-6 px-2 text-xs">
              {backingUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry backup
            </Button>
          </div>
        ) : null}

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
              </motion.div>
            </TabsContent>

            <TabsContent value="original">
              <motion.div initial={FADE_IN_INITIAL} animate={FADE_ANIMATE} transition={FAST_TRANSITION} className="pt-4">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    {docText === null ? (
                      <>
                        <Button onClick={viewOriginal} disabled={loadingDoc} variant="outline">
                          {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          Download & decrypt original
                        </Button>
                        {loadingDoc && docStatus ? (
                          <p className="text-xs text-muted-foreground">{docStatus}</p>
                        ) : null}
                      </>
                    ) : (
                      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs">
                        {docText || '(empty document)'}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Decrypted locally with your wallet-derived key. Binary files may not render as text.
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
              </div>
              {loadingDoc && docStatus ? (
                <p className="text-xs text-amber-800">{docStatus}</p>
              ) : null}
              {docText !== null ? (
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-white p-4 text-xs text-neutral-900">
                  {docText || '(empty document)'}
                </pre>
              ) : null}
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
                <p className="text-sm font-bold text-black">Date: {formatDate(meta.date)}</p>
                <p className="text-sm text-black">Type: {DOC_TYPE_LABELS[meta.docType]}</p>
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
