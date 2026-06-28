import { ArrowDown, ArrowUp, Minus, HelpCircle } from 'lucide-react'
import type { LabResult, LabFlag } from '@/lib/og/types'
import { cn } from '@/lib/utils'

const FLAG_STYLE: Record<LabFlag, string> = {
  low: 'text-sky-700 bg-sky-50',
  high: 'text-red-700 bg-red-50',
  normal: 'text-emerald-700 bg-emerald-50',
  unknown: 'text-slate-600 bg-slate-100',
}

function FlagIcon({ flag }: { flag: LabFlag }) {
  if (flag === 'low') return <ArrowDown className="h-3 w-3" />
  if (flag === 'high') return <ArrowUp className="h-3 w-3" />
  if (flag === 'normal') return <Minus className="h-3 w-3" />
  return <HelpCircle className="h-3 w-3" />
}

export function LabResultsTable({ results }: { results: LabResult[] }) {
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">No lab values found in this record.</p>
  }
  return (
    /*
      overflow-x-auto  — lets the table scroll horizontally on narrow screens
                         so the Flag column is never clipped by the parent
                         overflow-hidden border wrapper.
      The inner border + rounded corners are moved to the scroll container
      so they don't fight the overflow behaviour.
    */
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Test</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Reference</th>
            <th className="px-3 py-2 font-medium">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {results.map((r, i) => (
            <tr key={`${r.test}-${i}`}>
              <td className="px-3 py-2 font-medium">{r.test}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.value} {r.unit}
              </td>
              <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                {r.referenceRange || '\u2014'}
              </td>
              {/* whitespace-nowrap prevents the badge from being cut mid-render */}
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    FLAG_STYLE[r.flag],
                  )}
                >
                  <FlagIcon flag={r.flag} />{r.flag}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
