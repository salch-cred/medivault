'use client'

import { useEffect, useState } from 'react'
import { Cpu, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Provider = { on0g: boolean; host: string; model: string | null; label: string }

// Module-level cache so the badge only hits the endpoint once per session.
let cached: Provider | null = null

export function ComputeBadge({ className }: { className?: string }) {
  const [info, setInfo] = useState<Provider | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) return
    let cancelled = false
    fetch('/api/ai/provider')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Provider | null) => {
        if (!d || cancelled) return
        cached = d
        setInfo(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Badge variant="outline" className={className}>
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> AI
      </Badge>
    )
  }
  if (!info) return null

  const title = info.on0g
    ? `Analyzed on 0G Compute — decentralized inference${info.model ? ` · ${info.model}` : ''}. Your medical data is processed on the 0G network, not a centralized AI vendor.`
    : `Analyzed via ${info.host}${info.model ? ` · ${info.model}` : ''}.`

  return (
    <Badge variant={info.on0g ? 'secondary' : 'outline'} className={className} title={title}>
      <Cpu className="mr-1 h-3 w-3" />
      {info.on0g ? 'Analyzed on 0G Compute' : 'AI analyzed'}
    </Badge>
  )
}
