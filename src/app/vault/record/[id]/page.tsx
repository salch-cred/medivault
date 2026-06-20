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
        toast.error('File no longer exists on the 0G testnet. Testnet data is frequently pruned or wiped.')
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
          <div className="mb-6 rounded-t-xl bg-red-600 p-6 text-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <h1 className="text-3xl font-bold">MediVault Official Record</h1>
            <h2 className="mt-2 text-xl opacity-90">{meta.title}</h2>
            <div className="mt-2 flex gap-4 text-sm opacity-80">
              <span>Date: {formatDate(meta.date)}</span>
              <span>Type: {DOC_TYPE_LABELS[meta.docType]}</span>
            </div>
          </div>
          
          <div className="space-y-8 px-6 pb-6">
            <section>
              <h3 className="mb-2 border-b-2 border-red-200 pb-1 text-lg font-semibold text-red-700">Plain-Language Summary</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {summary.plainLanguageSummary || 'No summary available.'}
              </p>
            </section>

            {summary.redFlags.length > 0 && (
              <section>
                <h3 className="mb-2 border-b-2 border-red-200 pb-1 text-lg font-semibold text-red-700">Red Flags & Alerts</h3>
                <div className="space-y-3">
                  {summary.redFlags.map((r, i) => (
                    <div key={i} className="rounded-lg border-l-4 border-red-600 bg-red-50 p-3" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                      <p className="font-medium text-red-900">{r.issue} (Severity: {r.severity})</p>
                      {r.suggestion && <p className="mt-1 text-sm text-red-800">{r.suggestion}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 border-b-2 border-red-200 pb-1 text-lg font-semibold text-red-700">Extracted Data</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-red-800 mb-2">Conditions</h4>
                  <ul className="list-inside list-disc text-sm text-gray-800 marker:text-red-600">
                    {summary.conditions.length ? summary.conditions.map((c, i) => (
                      <li key={i}>{c.name} {c.status && `(${c.status})`}</li>
                    )) : <li>None</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-red-800 mb-2">Medications</h4>
                  <ul className="list-inside list-disc text-sm text-gray-800 marker:text-red-600">
                    {summary.medications.length ? summary.medications.map((m, i) => (
                      <li key={i}>{m.name} {m.dose && `- ${m.dose}`}</li>
                    )) : <li>None</li>}
                  </ul>
                </div>
              </div>
            </section>

            {summary.remedies && summary.remedies.length > 0 && (
              <section>
                <h3 className="mb-2 border-b-2 border-red-200 pb-1 text-lg font-semibold text-red-700">Recommended Remedies & Care</h3>
                <ul className="list-inside list-disc text-sm text-gray-800 marker:text-red-600">
                  {summary.remedies.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

            {summary.labResults.length > 0 && (
              <section>
                <h3 className="mb-2 border-b-2 border-red-200 pb-1 text-lg font-semibold text-red-700">Lab Results</h3>
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-red-50 text-red-800" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                      <th className="border-b border-red-200 py-2 px-2">Test</th>
                      <th className="border-b border-red-200 py-2 px-2">Value</th>
                      <th className="border-b border-red-200 py-2 px-2">Reference</th>
                      <th className="border-b border-red-200 py-2 px-2">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.labResults.map((l, i) => (
                      <tr key={i} className="border-b border-red-100">
                        <td className="py-2 px-2 font-medium">{l.test}</td>
                        <td className="py-2 px-2">{l.value} {l.unit}</td>
                        <td className="py-2 px-2 text-gray-500">{l.referenceRange}</td>
                        <td className="py-2 px-2">
                          {l.flag !== 'normal' ? <span className="text-red-600 font-bold capitalize">{l.flag}</span> : 'Normal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <footer className="mt-8 pt-4 border-t-2 border-red-100 text-xs text-gray-400">
              <p>Generated by MediVault via 0G Network</p>
              <p className="mt-1 break-all">0G Verification Root Hash: {meta.rootHash}</p>
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
