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

function RecordView({ meta }: { meta: RecordMeta }) {
  const { storage, key, summaries, loadSummary, getRecordKey } = useVault()
  const [summary, setSummary] = useState<ExtractionResult | undefined>(summaries[meta.id])
  const [loadingSummary, setLoadingSummary] = useState(!summaries[meta.id])
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [docText, setDocText] = useState<string | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)

  useEffect(() => {
    let active = true
    if (!summaries[meta.id]) {
      setLoadingSummary(true)
      loadSummary(meta).then((s) => {
        if (active) {
          setSummary(s ?? undefined)
          setLoadingSummary(false)
        }
      })
    } else {
      setSummary(summaries[meta.id])
    }
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id])

  async function verify() {
    if (!storage) return
    setVerifying(true)
    try {
      const ok = await storage.verifyIntegrity(meta.rootHash)
      setVerified(ok)
      toast[ok ? 'success' : 'error'](
        ok ? 'Integrity verified against 0G' : 'Integrity check failed',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verify failed')
    } finally {
      setVerifying(false)
    }
  }

  async function viewOriginal() {
    if (!storage) return
    const recKey = await getRecordKey(meta)
    if (!recKey) return
    setLoadingDoc(true)
    try {
      const bytes = await storage.downloadDecrypted(meta.rootHash, recKey)
      setDocText(new TextDecoder().decode(bytes))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.toLowerCase().includes('file not found')) {
        toast.error('File not found on the 0G network. It may have been deleted or the root hash is invalid.')
      } else {
        toast.error(msg || 'Could not load original document')
      }
    } finally {
      setLoadingDoc(false)
    }
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>

        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
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

        {verified !== null ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={
              verified
                ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'
            }
          >
            {verified
              ? 'This record’s Merkle root matches 0G — it has not been tampered with.'
              : 'The integrity check did not pass. The stored data may be unavailable or altered.'}
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
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4 pt-4">
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
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4 pt-4">
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
                {summary.allergies.length ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Allergies</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {summary.allergies.map((a) => (
                        <Badge key={a} variant="destructive">{a}</Badge>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
                {summary.remedies && summary.remedies.length > 0 ? (
                  <Card className="border-emerald-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
                        <Pill className="h-4 w-4" /> Recommended Remedies & Care
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-inside list-disc space-y-1 text-sm text-emerald-800">
                        {summary.remedies.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </motion.div>
            </TabsContent>

            <TabsContent value="original">
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="pt-4">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    {docText === null ? (
                      <Button onClick={viewOriginal} disabled={loadingDoc} variant="outline">
                        {loadingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        Download & decrypt original
                      </Button>
                    ) : (
                      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs">
                        {docText || '(empty document)'}
                      </pre>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Decrypted locally with your wallet-derived key. Binary files (e.g. images) may not
                      render as text.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground">
            No AI summary is available for this record.
          </p>
        )}

      <Disclaimer />
      </div>

      {summary && (
        <div className="hidden print:block print:bg-white print:text-black">
          {/* Header section with a clean, classic medical look */}
          <div className="mb-8 border-b-4 border-neutral-900 pb-6" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
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

            {summary.redFlags && summary.redFlags.length > 0 && (
              <section>
                <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Important Alerts</h3>
                <div className="space-y-3">
                  {summary.redFlags.map((r, i) => (
                    <div key={i} className="border-l-4 border-black pl-4 py-1">
                      <p className="font-bold text-black">{r.issue} <span className="font-normal text-neutral-600 uppercase text-xs ml-2">Severity: {r.severity}</span></p>
                      {r.suggestion && <p className="mt-1 text-base text-black">{r.suggestion}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Extracted Clinical Data</h3>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Conditions & Diagnoses</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                    {summary.conditions && summary.conditions.length ? summary.conditions.map((c, i) => (
                      <li key={i}>{c.name} {c.status && `(${c.status})`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Active Medications</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                    {summary.medications && summary.medications.length ? summary.medications.map((m, i) => (
                      <li key={i}>{m.name} {m.dose && `- ${m.dose}`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
              </div>
            </section>

            {summary.remedies && summary.remedies.length > 0 && (
              <section>
                <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Recommended Remedies & Care</h3>
                <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                  {summary.remedies.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

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
                        <td className="py-2 px-2">
                          {l.flag !== 'normal' ? <span className="font-bold uppercase text-black">{l.flag}</span> : 'Normal'}
                        </td>
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
