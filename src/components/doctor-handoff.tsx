'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Disclaimer } from '@/components/disclaimer'
import { buildEmergencyProfile, upcomingFollowUps } from '@/lib/health'
import { formatDate, shortHash } from '@/lib/utils'
import type { VaultRecord } from '@/lib/og/types'

export function DoctorHandoff({
  records,
  address,
}: {
  records: VaultRecord[]
  address: string | null
}) {
  const profile = buildEmergencyProfile(records)
  const followUps = upcomingFollowUps(records)
  const withSummary = records.filter((r) => r.summary)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          A one-page summary you can print or share with a clinician.
        </p>
        <Button onClick={() => window.print()} variant="outline">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">Doctor handoff summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Generated {formatDate(new Date().toISOString())}
            {address ? ` · Patient wallet ${shortHash(address)}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h3 className="mb-2 font-semibold">Active conditions</h3>
            {profile.conditions.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {profile.conditions.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span>
                    {c.status ? ` — ${c.status}` : ''}
                    {c.note ? ` (${c.note})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Current medications</h3>
            {profile.medications.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {profile.medications.map((m, i) => (
                  <li key={i}>
                    <span className="font-medium">{m.name}</span>
                    {m.dose ? ` · ${m.dose}` : ''}
                    {m.frequency ? ` · ${m.frequency}` : ''}
                    {m.purpose ? ` — ${m.purpose}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Allergies</h3>
            {profile.allergies.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.allergies.map((a) => (
                  <Badge key={a} variant="destructive">
                    {a}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Outstanding follow-ups</h3>
            {followUps.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {followUps.map((f, i) => (
                  <li key={i}>
                    {f.action}
                    {f.byDate ? ` — by ${formatDate(f.byDate)}` : ''} ({f.priority} priority)
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Records reviewed ({withSummary.length})</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {withSummary.map((r) => (
                <li key={r.meta.id}>
                  {formatDate(r.summary?.date ?? r.meta.date)} — {r.summary?.title || r.meta.title}
                </li>
              ))}
            </ul>
          </section>

          <Disclaimer />
        </CardContent>
      </Card>
    </div>
  )
}
