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

  useEffect(() => {
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

        const bytes = await storage.downloadDecryptedShared(hash, privateKey)
        const payload = JSON.parse(new TextDecoder().decode(bytes))
        setDecryptedData(payload)
      } catch (err: any) {
        console.error('Shared decryption failed:', err)
        if (err.message?.toLowerCase().includes('file not found') || err.message?.toLowerCase().includes('no locations found')) {
          setError('Document is still registering on the 0G network, or has been pruned. Please wait a moment or request the sender to re-share.')
        } else {
          setError(err.message || 'Could not decrypt shared record.')
        }
      } finally {
        setLoading(false)
      }
    }

    decryptRecord()
  }, [hash, storage, autoWalletSigner])

  if (loading) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Downloading & decrypting secure record from 0G...</p>
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="print:hidden">
        <Link href="/vault" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to vault
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
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
  )
}
