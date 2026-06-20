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

export function UploadPanel({ onUploaded }: { onUploaded?: (id: string) => void }) {
  const { status, address, autoWalletAddress, autoWalletSigner, key, storage, index, language, eli5, addRecord } = useVault()
  const [stage, setStage] = useState<Stage>('idle')
  const [pct, setPct] = useState(0)
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

      // Animate the progress bar forward slowly during blockchain waits
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

        // Ensure the auto-wallet has enough gas for the 0G upload.
        const provider = new ethers.JsonRpcProvider(ZG.RPC_URL)
        const balance = await provider.getBalance(autoWalletAddress!)
        if (balance === 0n) {
          throw new Error('Insufficient 0G gas! Please click "Fund Auto-Wallet" in the status panel on the right.')
        }

        // Derive a per-record AES key so each upload uses a distinct key.
        const salt = newRecordSalt()
        const recKey = await deriveRecordKey(key!, salt)

        // Tick progress slowly from 65→85% while waiting for 0G upload (can take 30-90s on mainnet)
        startTick(65, 85, 90000)
        const { rootHash, txHash } = await storage!.uploadEncrypted(file, recKey)
        const summaryBytes = new TextEncoder().encode(JSON.stringify(summary))
        const { rootHash: summaryRootHash } = await storage!.uploadEncrypted(summaryBytes, recKey)
        stopTick(88)

        setStage('indexing')
        startTick(88, 97, 30000)
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
        await index!.put(meta)
        addRecord(meta, summary)
        stopTick(100)

        setStage('done')
        setPct(100)
        toast.success('Encrypted and saved to 0G Mainnet! 🎉', {
          description: txHash ? `tx ${txHash.slice(0, 10)}…` : 'Stored on 0G decentralized storage',
        })
        onUploaded?.(meta.id)
        setTimeout(() => {
          setStage('idle')
          setPct(0)
        }, 1600)
      } catch (e) {
        if (tickInterval) clearInterval(tickInterval)
        setStage('idle')
        setPct(0)
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
          whileHover={!busy ? { scale: 1.01 } : {}}
          whileTap={!busy ? { scale: 0.99 } : {}}
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
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
              <FileCheck2 className="h-8 w-8 text-emerald-500" />
            </motion.div>
          ) : (
            <UploadCloud className="h-8 w-8 text-primary" />
          )}
          <AnimatePresence mode="wait">
            <motion.p
              key={stage}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="mt-3 font-medium"
            >
              {busy || stage === 'done' ? STAGE_LABEL[stage] : 'Drop a file or click to upload'}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1 text-xs text-muted-foreground">
            TXT, MD, PDF, or an image (PNG/JPG — OCR). Encrypted before it leaves your device.
          </p>
        </motion.div>

        {busy || stage === 'done' ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
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
