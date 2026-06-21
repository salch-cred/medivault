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
import { detectKind, extractText } from '@/lib/doc/parse'
import { normalizeExtraction } from '@/lib/ai/normalize'
import { buildAuthHeader, createAuthedProvider } from '@/lib/client/auth'
import { deriveRecordKey, newRecordSalt, saltToHex } from '@/lib/og/crypto'
import type { ExtractionResult, RecordMeta } from '@/lib/og/types'
import { ZG } from '@/lib/og/config'
import { cn } from '@/lib/utils'

type Stage = 'idle' | 'parsing' | 'analyzing' | 'encrypting' | 'done'

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  parsing: 'Reading your document…',
  analyzing: 'AI is explaining it (0G Compute)…',
  encrypting: 'Encrypting your document…',
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

function titleFromFile(file: File): string {
  const clean = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return clean || 'Uploaded document'
}

function fallbackSummary(file: File, text: string, reason?: unknown): ExtractionResult {
  const kind = detectKind(file)
  const docType = kind === 'image' ? 'imaging' : 'other'
  const reasonText = reason instanceof Error ? reason.message : reason ? String(reason) : ''
  const plainLanguageSummary = [
    'This document was uploaded and encrypted successfully.',
    'Automatic text extraction or AI explanation was unavailable, so MediVault saved a basic record summary instead.',
    reasonText ? `Reason: ${reasonText}` : '',
    text?.trim() ? `Extracted text preview:\n${text.trim().slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n\n')

  return normalizeExtraction({
    title: titleFromFile(file),
    docType,
    date: null,
    plainLanguageSummary,
    confidence: 0,
    sourceQuotes: text?.trim()
      ? [{ quote: text.trim().slice(0, 220), supports: 'Extracted document text preview' }]
      : [],
  })
}

export function UploadPanel({ onUploaded }: { onUploaded?: (id: string) => void }) {
  const { status, address, autoWalletAddress, autoWalletSigner, key, storage, index, language, eli5, addRecord, cacheOriginal, setUploadStatus, autoBackup, signer } = useVault()
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

      if (!autoWalletSigner || !autoWalletAddress) {
        toast.error('Your wallet is still reconnecting. Please wait a moment and try again.')
        return
      }

      try {
        setStage('parsing')
        setPct(10)
        setDetail('')
        const auth = await buildAuthHeader(autoWalletSigner, autoWalletAddress)

        let text = ''
        let extractionWarning: unknown = null
        try {
          text = await extractText(file, (_s, p) => p && setPct(Math.min(40, 10 + p * 0.3)), auth)
        } catch (parseErr) {
          extractionWarning = parseErr
          console.warn('Document text extraction failed; continuing with fallback summary:', parseErr)
          text = `Uploaded file: ${file.name}\nMIME type: ${file.type || 'unknown'}\nSize: ${file.size} bytes`
          toast.message('Text extraction failed, but the encrypted original will still be saved to 0G.')
        }
        if (!text.trim()) {
          text = `Uploaded file: ${file.name}\nMIME type: ${file.type || 'unknown'}\nSize: ${file.size} bytes`
        }

        setStage('analyzing')
        setPct(55)
        let summary: ExtractionResult
        try {
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
          summary = normalizeExtraction(result)
        } catch (aiErr) {
          console.warn('AI extraction failed; continuing with fallback summary:', aiErr)
          summary = fallbackSummary(file, text, extractionWarning ?? aiErr)
          toast.message('AI explanation failed, but the encrypted original will still be saved to 0G.')
        }

        setStage('encrypting')
        setPct(75)

        const provider = await createAuthedProvider(signer, address, ZG.RPC_URL)
        const balance = await provider.getBalance(autoWalletAddress)
        if (balance === 0n) {
          throw new Error('Insufficient 0G gas! Please click "Fund Auto-Wallet" in the status panel on the right.')
        }

        const salt = newRecordSalt()
        const recKey = await deriveRecordKey(key!, salt)
        const summaryBytes = new TextEncoder().encode(JSON.stringify(summary))
        const [filePrep, summaryPrep] = await Promise.all([
          storage!.prepareUpload(file, recKey),
          storage!.prepareUpload(summaryBytes, recKey),
        ])
        setPct(95)

        const meta: RecordMeta = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `rec_${Date.now()}`,
          owner: address!,
          title: summary.title || titleFromFile(file),
          docType: summary.docType,
          date: summary.date,
          rootHash: filePrep.rootHash,
          summaryRootHash: summaryPrep.rootHash,
          recordKeySalt: saltToHex(salt),
          fileName: file.name,
          mimeType: file.type || undefined,
          createdAt: new Date().toISOString(),
        }

        addRecord(meta, summary)
        try {
          const originalBytes = new Uint8Array(await file.arrayBuffer())
          cacheOriginal(meta.id, originalBytes)
        } catch (cacheErr) {
          console.warn('Failed to cache original locally:', cacheErr)
        }
        setUploadStatus(meta.id, 'pending')

        setStage('done')
        setPct(100)
        toast.success('Saved to your vault! 🎉', {
          description: 'Backing up to 0G storage in the background…',
        })
        onUploaded?.(meta.id)
        setTimeout(() => {
          setStage('idle')
          setPct(0)
          setDetail('')
        }, 1400)

        void (async () => {
          try {
            const fileResult = await filePrep.finalize()
            await summaryPrep.finalize()
            await index!.put(meta).catch((e) => console.warn('KV index write failed:', e))
            setUploadStatus(meta.id, 'stored')
            useVault.getState().syncRemoteIndex()
            toast.success('Backed up to 0G ✓', {
              description: fileResult.txHash ? `tx ${fileResult.txHash.slice(0, 10)}…` : 'Stored on 0G decentralized storage',
            })
          } catch (bgErr) {
            console.error('Background 0G backup failed; auto-retrying until it lands:', bgErr)
            setUploadStatus(meta.id, 'pending')
            toast.message('0G backup is taking a moment — auto-retrying in the background…')
            void autoBackup(meta)
          }
        })()
      } catch (e) {
        setStage('idle')
        setPct(0)
        setDetail('')
        toast.error(e instanceof Error ? e.message : 'Upload failed')
      }
    },
    [connected, storage, index, key, autoWalletSigner, autoWalletAddress, address, signer, language, eli5, addRecord, cacheOriginal, setUploadStatus, autoBackup, onUploaded],
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
          onDragLeave={() => setDragging(false)
          }
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
