'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Server,
  Link2,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Boxes,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ZG } from '@/lib/og/config'

type NodeInfo = { label: string; url?: string; shard?: string }

type Health = {
  checkedAt: string
  chainName: string
  chainId: number
  flowContract: string
  blockExplorer: string
  storageExplorer: string
  chain: { url: string; ok: boolean; ms: number; value?: { blockNumber: number }; error?: string }
  storage: { url: string; ok: boolean; ms: number; value?: { total: number; nodes: NodeInfo[] }; error?: string }
}

function StatusPill({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Online
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3" /> Unreachable
    </Badge>
  )
}

export function NetworkHealth() {
  const [data, setData] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/og/health', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {
      // leave previous data in place on a transient failure
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const nodes = data?.storage.value?.nodes ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h1 className="text-2xl font-bold">0G network health</h1>
        </div>
        <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Live status of the 0G decentralized infrastructure that stores, secures, and serves your records. Probed server-side in real time.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> 0G Chain</span>
              {data ? <StatusPill ok={data.chain.ok} /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Network</span>
              <span className="font-medium">{data?.chainName ?? ZG.CHAIN_NAME} · {data?.chainId ?? ZG.CHAIN_ID}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Latest block</span>
              <span className="font-mono font-medium">{data?.chain.value ? `#${data.chain.value.blockNumber.toLocaleString()}` : '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">RPC latency</span>
              <span className="font-medium">{data ? `${data.chain.ms} ms` : '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Flow storage contract</span>
              <a href={`${ZG.BLOCK_EXPLORER}/address/${ZG.FLOW_CONTRACT}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-primary underline">
                {ZG.FLOW_CONTRACT.slice(0, 8)}…{ZG.FLOW_CONTRACT.slice(-6)} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> 0G Storage nodes</span>
              {data ? <StatusPill ok={data.storage.ok} /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Trusted nodes serving now</span>
              <span className="font-bold text-lg">{data?.storage.value ? data.storage.value.total : '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Indexer latency</span>
              <span className="font-medium">{data ? `${data.storage.ms} ms` : '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Your data is</span>
              <span className="font-medium">Replicated across nodes</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Each record is content-addressed by its Merkle root and distributed across these independent nodes — no single operator can alter or withhold it.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-primary" /> Storage node map
            {data?.storage.value ? <Badge variant="outline">{data.storage.value.total} live</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Probing 0G storage nodes…
            </div>
          ) : nodes.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nodes.map((n, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-medium" title={n.url || n.label}>{n.label}</p>
                    {n.shard ? <p className="text-[10px] text-muted-foreground">{n.shard}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The indexer didn’t return an individual node list this round (it may be load-balancing). The node count above still reflects live capacity.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4 text-primary" /> 0G Compute</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI summaries and chat run on the decentralized 0G Compute inference network — your medical data is never sent to a centralized AI vendor.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Client-side encryption</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Every file is AES-256 encrypted in your browser before it ever touches the 0G network. Nodes only ever hold ciphertext.
          </CardContent>
        </Card>
      </div>

      {data ? (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" /> Last checked {new Date(data.checkedAt).toLocaleTimeString()}
          <span className="px-1">·</span>
          <Link href={ZG.STORAGE_EXPLORER} target="_blank" className="text-primary underline">0G storage explorer</Link>
        </div>
      ) : null}
    </div>
  )
}
