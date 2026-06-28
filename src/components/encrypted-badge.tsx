import { Lock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { shortHash } from '@/lib/utils'
import { storageScanUrl } from '@/lib/og/config'

export function EncryptedBadge({ rootHash }: { rootHash?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success" className="gap-1">
        <Lock className="h-3 w-3" /> Encrypted on 0G
      </Badge>
      {rootHash ? (
        <a
          href={storageScanUrl(rootHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          title={rootHash}
        >
          {shortHash(rootHash)} <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  )
}
