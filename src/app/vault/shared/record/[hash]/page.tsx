'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, ShieldCheck, Printer, User, Mail, Calendar, Pill, HeartPulse } from 'lucide-react'
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
import { DOC_TYPE_LABELS } from '@/lib/og/types'
import { formatDate, shortHash } from '@/lib/utils'

export default function SharedRecordPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { storage, autoWalletSigner } = useVault()

  const hash = params.hash as string
  const senderNameParam = searchParams.get('senderName') || 'Unknown Patient'
  const senderAddressParam = searchParams.get('senderAddress') || '0x'

  const [loading, setLoading] = useState(true)
  const [decryptedData, setDecryptedData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

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

        // downloadDecryptedShared is patient-by-default: it waits (with fast 3s
        // polling, ~90s budget) for the just-shared file to propagate across the
        // 0G indexer, reporting live status, instead of failing fast. No manual
        // outer retry loop needed.
        const bytes = await storage.downloadDecryptedShared(
          hash,
          privateKey,
          (m) => {
            if (active) setStatus(m)
          },
        )

        const payload = JSON.parse(new TextDecoder().decode(bytes))
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
  }, [hash, storage, autoWalletSigner])

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

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto print:hidden">
      <div className="print:hidden">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
      </div>

      <motion.div
        initial= opacity: 0, y: 12 
        animate= opacity: 1, y: 0 
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <DocTypeIcon type={docType} withTone />
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{(DOC_TYPE_LABELS as any)[docType] || docType}</Badge>
              <span className="text-sm text-muted-foreground">Document Date: {formatDate(date)}</span>
            </div>
            <div className="mt-2">
              <EncryptedBadge rootHash={hash} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="h-4 w-4" /> Print Report
          </Button>
        </div>
      </motion.div>

      {/* Patient / Sender Information */}
      <Card className="border-neutral-800 bg-neutral-950/40">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Shared By</p>
              <p className="text-sm font-semibold">{senderName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sender Wallet Address</p>
              <p className="text-sm font-mono">{senderAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Received Date</p>
              <p className="text-sm font-semibold">{formatDate(sharedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary ? (
        <Tabs defaultValue="explanation" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="explanation">Clinical Explanation</TabsTrigger>
            <TabsTrigger value="data">Structured Data</TabsTrigger>
          </TabsList>

          <TabsContent value="explanation" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Clinical Overview</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{summary.summary}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-6 pt-4">
            {/* Vitals */}
            {summary.vitals && summary.vitals.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Extracted Vitals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {summary.vitals.map((v: any, i: number) => (
                      <div key={i} className="rounded-xl border p-3">
                        <p className="text-xs text-muted-foreground">{v.name}</p>
                        <p className="mt-0.5 text-base font-bold">
                          {v.value} <span className="text-xs font-normal text-muted-foreground">{v.unit}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Diagnoses */}
            {summary.diagnoses && summary.diagnoses.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Diagnoses & Conditions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {summary.diagnoses.map((d: any, i: number) => (
                      <Badge key={i} variant="secondary" className="px-3 py-1 text-xs">
                        {d.name} {d.status ? `(${d.status})` : ''}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Remedies Section */}
            {summary.remedies && summary.remedies.length > 0 && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardHeader className="pb-2 flex flex-row items-center gap-2">
                  <div className="rounded-full bg-emerald-500/10 p-1.5 text-emerald-500">
                    <Pill className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base text-emerald-400">Recommended Remedies & Care</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-neutral-300">
                    {summary.remedies.map((remedy: string, idx: number) => (
                      <li key={idx} className="leading-relaxed">
                        {remedy}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Medications */}
            {summary.medications && summary.medications.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Active Medications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {summary.medications.map((m: any, i: number) => (
                      <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                        <p className="text-sm font-semibold">{m.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Dosage: {m.dosage} · Frequency: {m.frequency}
                          {m.purpose ? ` · Purpose: ${m.purpose}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Labs */}
            {summary.labs && summary.labs.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Lab Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border">
                    {summary.labs.map((l: any, i: number) => (
                      <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">{l.name}</p>
                          {l.range ? <p className="text-xs text-muted-foreground mt-0.5">Reference range: {l.range}</p> : null}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{l.value}</p>
                          <Badge variant={l.flag === 'high' || l.flag === 'low' ? 'destructive' : 'secondary'} className="text-[10px] capitalize py-0 mt-0.5">
                            {l.flag || 'normal'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">No shared extraction data available.</p>
      )}

      <Disclaimer />
      </div>

      {summary && (
        <div className="hidden print:block print:bg-white print:text-black">
          {/* Header section with a clean, classic medical look */}
          <div className="mb-8 border-b-4 border-neutral-900 pb-6" style= pageBreakAfter: 'avoid' >
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-black tracking-tight uppercase">MediVault</h1>
                <p className="text-sm font-semibold text-neutral-600 mt-1 uppercase tracking-widest">Shared Medical Record</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-black">Date: {formatDate(date)}</p>
                <p className="text-sm text-black uppercase tracking-wider">Shared By: {senderName}</p>
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-black">{title}</h2>
          </div>
          
          <div className="space-y-8 pb-6">
            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Clinical Summary</h3>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-black">
                {summary.summary || 'No summary available.'}
              </p>
            </section>

            <section>
              <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Extracted Clinical Data</h3>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Conditions & Diagnoses</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                    {summary.diagnoses && summary.diagnoses.length ? summary.diagnoses.map((c: any, i: number) => (
                      <li key={i}>{c.name} {c.status && `(${c.status})`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-black mb-2 text-base">Active Medications</h4>
                  <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                    {summary.medications && summary.medications.length ? summary.medications.map((m: any, i: number) => (
                      <li key={i}>{m.name} {m.dosage && `- ${m.dosage}`}</li>
                    )) : <li>None Recorded</li>}
                  </ul>
                </div>
              </div>
            </section>

            {summary.remedies && summary.remedies.length > 0 && (
              <section>
                <h3 className="mb-3 border-b-2 border-neutral-200 pb-1 text-lg font-bold text-black uppercase tracking-wider">Recommended Remedies & Care</h3>
                <ul className="list-inside list-disc text-base text-black marker:text-black space-y-1">
                  {summary.remedies.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

            {summary.labs && summary.labs.length > 0 && (
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
                    {summary.labs.map((l: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2 px-2 font-semibold">{l.name}</td>
                        <td className="py-2 px-2">{l.value}</td>
                        <td className="py-2 px-2 text-neutral-600">{l.range}</td>
                        <td className="py-2 px-2">
                          {l.flag && l.flag !== 'normal' ? <span className="font-bold uppercase text-black">{l.flag}</span> : 'Normal'}
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
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
