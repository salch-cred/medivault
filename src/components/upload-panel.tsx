'use client'

import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, Loader2, FileCheck2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Disclaimer } from '@/components/disclaimer'
import { OptionsBar } from '@/components/options-bar'
import { useVault } from '@/lib/store'
import { extractText } from '@/lib/doc/parse'
import { normalizeExtraction } from '@/lib/ai/normalize'
import { buildAuthHeader } from '@/lib/client/auth'
import { deriveRecordKey, newRecordSalt, saltToHex } from '@/lib/og/crypto'
import type { ExtractionResult, RecordMeta } from '@/lib/og/types'
import { ZG } from '@/lib/og/config'
import { ethers } from 'ethers'
import { cn } from '@/lib/utils'

type Stage = 'idle' | 'parsing' | 'analyzing' | 'encrypting' | 'indexing' | 'done'

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  parsing: 'Reading your document…',
  analyzing: 'AI is explaining it (0G Compute)…',
  encrypting: 'Encrypting + uploading to 0G…',
  indexing: 'Updating your decentralized index…',
  done: 'Saved to your vault',
}

const DONE_ICON_INITIAL = { opacity: 0, scale: 0.8 }
const DONE_ICON_ANIMATE = { opacity: 1, scale: 1 }
const DONE_ICON_TRANSITION = { duration: 0.3 }
const LABEL_INITIAL = { opacity: 0, y: 4 }
const LABEL_ANIMATE = { opacity: 1, y: 0 }
const LABEL_EXIT = { opacity: 0, y: -4 }
const LABEL_TRANSITION = { duration: 0.2 }
const PROGRESS_INITIAL = { opacity: 0 }
const PROGRESS_ANIMATE = { opacity: 1 }

// Map a raw 0G SDK progress message to a short, friendly line + a progress %.
function friendlyProgress(msg: string): { label: string; pct?: number } {
  const m = msg.toLowerCase()
  if (m.includes('transaction submitted')) return { label: 'Transaction submitted on 0G…', pct: 72 }
  if (m.includes('waiting for storage node to sync')) return { label: 'Waiting for storage node to sync…', pct: 80 }
  if (m.includes('log entry confirmed') || m.includes('uploading segments')) return { label: 'Uploading encrypted segments…', pct: 86 }
  if (m.includes('segments uploaded') || m.includes('finality')) return { label: 'Almost done — finalizing…', pct: 90 }
  if (m.includes('finalized') || m.includes('already stored')) return { label: 'Stored on 0G ✓', pct: 92 }
  return { label: msg }
}

export function UploadPanel({ onUploaded }: { onUploaded?: (id: string) => void }) {
  const { status, address, autoWalletAddress, autoWalletSigner, key, storage, index, language, eli5, addRecord } = useVault()
  const [stage, setStage] = useState<Stage>('idle')
  const [pct, setPct] = useState(0)
  const [detail, setDetail] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = stage !== 'idle' && stage !== 'done'
  const connected = status === 'connected' && !!storage && !!index && !!key && !!address

  const handleFile = useCallback(
    async (file: File) => {
      if (!connected) {
        toast.error('Connect your wallet first.')
        return
      }

      // Pre-warm 0G node selection now (during the slow parse/AI step) so the
      // actual upload's node selection is already cached + sorted by sync.
      void storage?.prewarm()

      let tickInterval: ReturnType<typeof setInterval> | null = null
      const startTick = (from: number, to: number, durationMs = 45000) => {
        if (tickInterval) clearInterval(tickInterval)
        const step = (to - from) / (durationMs / 500)
        let current = from
        tickInterval = setInterval(() => {
          current = Math.min(to, current + step)
          setPct(Math.round(current))
        }, 500)
      }
      const stopTick = (finalPct: number) => {
        if (tickInterval) clearInterval(tickInterval)
        tickInterval = null
        setPct(finalPct)
      }

      try {
        setStage('parsing')
        setPct(10)
        setDetail('')
        const auth = await buildAuthHeader(autoWalletSigner, autoWalletAddress)
        const text = await extractText(file, (_s, p) => p && setPct(Math.min(40, 10 + p * 0.3)), auth)
        if (!text.trim()) throw new Error('Could not read any text from this document.')

        setStage('analyzing')
        setPct(50)
        const res = await fetch('/api/ai/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(auth ? { 'x-medivault-auth': auth } : {}),
          },
          body: JSON.stringify({ text, language, eli5 }),
        })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: 'AI extraction failed' }))
          throw new Error(error)
        }
        const { result } = (await res.json()) as { result: ExtractionResult }
        const summary = normalizeExtraction(result)

        setStage('encrypting')
        setPct(65)

        const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
        const balance = await provider.getBalance(autoWalletAddress!)
        if (balance === 0n) {
          throw new Error('Insufficient 0G gas! Please click "Fund Auto-Wallet" in the status panel on the right.')
        }

        const salt = newRecordSalt()
        const recKey = await deriveRecordKey(key!, salt)

        startTick(65, 70, 8000)
        // Live progress from the SDK (replaces the blank-spinner wait). The file
        // upload drives the detail line; the tiny summary upload runs alongside.
        const onProgress = (m: string) => {
          const { label, pct: p } = friendlyProgress(m)
          setDetail(label)
          if (typeof p === 'number') {
            stopTick(p)
          }
        }
        const summaryBytes = new TextEncoder().encode(JSON.stringify(summary))
        const [{ rootHash, txHash }, { rootHash: summaryRootHash }] = await Promise.all([
          storage!.uploadEncrypted(file, recKey, onProgress),
          storage!.uploadEncrypted(summaryBytes, recKey),
        ])
        stopTick(92)
        setDetail('')

        setStage('indexing')
        startTick(92, 98, 8000)
        const meta: RecordMeta = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rec_${Date.now()}`,
          owner: address!,
          title: summary.title,
          docType: summary.docType,
          date: summary.date,
          rootHash,
          summaryRootHash,
          recordKeySalt: saltToHex(salt),
          createdAt: new Date().toISOString(),
        }
        void index!.put(meta).catch(e => console.warn('KV index write failed:', e))
        addRecord(meta, summary)
        stopTick(100)

        setStage('done')
        setPct(100)
        toast.success('Encrypted and saved to 0G! 🎉', {
          description: txHash ? `tx ${txHash.slice(0, 10)}…` : 'Stored on 0G decentralized storage',
        })
        onUploaded?.(meta.id)
        setTimeout(() => {
          setStage('idle')
          setPct(0)
          setDetail('')
        }, 1600)
      } catch (e) {
        if (tickInterval) clearInterval(tickInterval)
        setStage('idle')
        setPct(0)
        setDetail('')
        toast.error(e instanceof Error ? e.message : 'Upload failed')
      }
    },
    [connected, storage, index, key, autoWalletSigner, autoWalletAddress, address, language, eli5, addRecord, onUploaded],
  )

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Add a medical document</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Upload a file for AI extraction</p>
          </div>
          <OptionsBar />
        </div>
        <motion.div
          whileHover={!busy ? { scale: 1.01 } : undefined}
          whileTap={!busy ? { scale: 0.99 } : undefined}
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) void handleFile(f)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60',
            busy && 'pointer-events-none opacity-70',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
          {busy ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : stage === 'done' ? (
            <motion.div initial={DONE_ICON_INITIAL} animate={DONE_ICON_ANIMATE} transition={DONE_ICON_TRANSITION}>
              <FileCheck2 className="h-8 w-8 text-emerald-500" />
            </motion.div>
          ) : (
            <UploadCloud className="h-8 w-8 text-primary" />
          )}
          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              initial={LABEL_INITIAL}
              animate={LABEL_ANIMATE}
              exit={LABEL_EXIT}
              transition={LABEL_TRANSITION}
              className="mt-3 font-medium"
            >
              {busy || stage === 'done' ? STAGE_LABEL[stage] : 'Drop a file or click to upload'}
            </motion.p>
          </AnimatePresence>
          {busy && detail ? (
            <p className="mt-1 text-xs text-primary/80">{detail}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              TXT, MD, PDF, or an image (PNG/JPG — OCR). Encrypted before it leaves your device.
            </p>
          )}
        </motion.div>

        {busy || stage === 'done' ? (
          <motion.div initial={PROGRESS_INITIAL} animate={PROGRESS_ANIMATE}>
            <Progress value={pct} />
          </motion.div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> AES-256 client-side. The 0G network only ever sees ciphertext.
        </div>
        <Disclaimer compact />
      </CardContent>
    </Card>
  )
}
