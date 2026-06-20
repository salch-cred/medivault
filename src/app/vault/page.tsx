'use client'

import { motion } from 'framer-motion'
import { CalendarClock } from 'lucide-react'
import { ConnectGate } from '@/components/connect-gate'
import { UploadPanel } from '@/components/upload-panel'
import { RecordList } from '@/components/record-list'
import { OgStatus } from '@/components/og-status'
import { HealthTimeline } from '@/components/health-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useVaultRecords } from '@/hooks/use-vault-records'
import { useVault } from '@/lib/store'
import { ReceivedRecords } from '@/components/received-records'
import { upcomingFollowUps } from '@/lib/health'
import { formatDate } from '@/lib/utils'
import { staggerContainer, staggerItem } from '@/lib/motion'

function FollowUps() {
  const records = useVaultRecords()
  const followUps = upcomingFollowUps(records).slice(0, 5)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" /> Upcoming follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent>
        {followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups extracted yet.</p>
        ) : (
          <ul className="space-y-3">
            {followUps.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{f.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.recordTitle}
                    {f.byDate ? ` · by ${formatDate(f.byDate)}` : ''}
                  </p>
                </div>
                <Badge
                  variant={f.priority === 'high' ? 'destructive' : f.priority === 'medium' ? 'warning' : 'secondary'}
                  className="shrink-0 capitalize"
                >
                  {f.priority}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TimelinePreview() {
  const records = useVaultRecords()
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Health timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <HealthTimeline records={records} />
      </CardContent>
    </Card>
  )
}

const containerVariants = staggerContainer(0.08, 0.05)
const itemVariants = staggerItem

export default function VaultDashboard() {
  return (
    <ConnectGate>
      <div className="relative">
        {/* Background ambient gradients. Heavy blur is GPU-costly, so they only
            render on md+ — mobile gets the clean flat background for perf. */}
        <div className="pointer-events-none absolute -left-40 -top-40 hidden h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px] mix-blend-multiply opacity-50 md:block" />
        <div className="pointer-events-none absolute -right-20 top-40 hidden h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[120px] mix-blend-multiply opacity-30 md:block" />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="relative z-10 space-y-6 md:space-y-8"
        >
          <motion.div variants={itemVariants} className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="min-w-0">
              <h1 className="font-serif text-3xl tracking-tight sm:text-4xl md:text-[2.75rem]">
                Your Health Vault
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Securely encrypted on the 0G Network. Owned exclusively by your wallet.
                <span className="font-medium text-foreground/80"> Impossible to access by anyone else.</span>
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2 backdrop-blur-md">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Status</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-medium">Network Secured</span>
              </div>
            </div>
          </motion.div>
          
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-6 lg:col-span-2 lg:space-y-8">
              <motion.div variants={itemVariants} className="overflow-hidden rounded-3xl border border-border/50 bg-background/60 shadow-xl backdrop-blur-2xl transition-all hover:shadow-2xl">
                <UploadPanel />
              </motion.div>
              
              <motion.div variants={itemVariants} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight md:text-xl">Recent Records</h2>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">Decrypted Locally</Badge>
                </div>
                <div className="rounded-3xl border border-border/50 bg-background/60 p-1 shadow-lg backdrop-blur-xl">
                  <RecordList />
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight md:text-xl">Shared with You</h2>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">ECIES Decrypted</Badge>
                </div>
                <div className="rounded-3xl border border-border/50 bg-background/60 p-1 shadow-lg backdrop-blur-xl">
                  <ReceivedRecords />
                </div>
              </motion.div>
            </div>

            <div className="space-y-6 md:space-y-8">
              <motion.div variants={itemVariants}>
                <OgStatus />
              </motion.div>
              <motion.div variants={itemVariants} className="overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-background/80 to-background/40 shadow-lg backdrop-blur-xl transition-transform duration-300 hover:scale-[1.01]">
                <FollowUps />
              </motion.div>
              <motion.div variants={itemVariants} className="overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-background/80 to-background/40 shadow-lg backdrop-blur-xl transition-transform duration-300 hover:scale-[1.01]">
                <TimelinePreview />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </ConnectGate>
  )
}
