import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Persistent, non-dismissable safety disclaimer used across the app. */
export function Disclaimer({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800',
        compact ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        MediVault organizes and explains your records. <strong>It is not medical advice.</strong>{' '}
        Always consult a qualified clinician for decisions about your health.
      </p>
    </div>
  )
}
