'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { collectLabSeries, type LabSeries } from '@/lib/health'
import { formatDate } from '@/lib/utils'
import type { VaultRecord } from '@/lib/og/types'

// Hoisted to avoid inline object literals in JSX props.
const CHART_MARGIN = { top: 10, right: 12, bottom: 0, left: -12 }
const AXIS_TICK = { fontSize: 11 }
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid hsl(var(--border))',
  fontSize: 12,
}
const DOT = { r: 3 }
const ACTIVE_DOT = { r: 5 }

function SeriesChart({ series }: { series: LabSeries }) {
  const data = series.points.map((p, i) => ({
    idx: i,
    label: formatDate(p.date),
    value: p.value,
    flag: p.flag,
  }))
  const values = series.points.map((p) => p.value)
  const min = Math.min(...values, series.low ?? Infinity)
  const max = Math.max(...values, series.high ?? -Infinity)
  const pad = (max - min || 1) * 0.2

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="capitalize">{series.test}</span>
          <Badge variant="secondary">{series.unit || 'value'}</Badge>
        </CardTitle>
        {(series.low !== undefined || series.high !== undefined) && (
          <p className="text-xs text-muted-foreground">
            Reference: {series.low ?? '—'} – {series.high ?? '—'} {series.unit}
          </p>
        )}
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={AXIS_TICK} />
            <YAxis domain={[min - pad, max + pad]} tick={AXIS_TICK} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v} ${series.unit}`, series.test]}
            />
            {series.low !== undefined && series.high !== undefined ? (
              <ReferenceArea
                y1={series.low}
                y2={series.high}
                fill="hsl(var(--success))"
                fillOpacity={0.12}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={DOT}
              activeDot={ACTIVE_DOT}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function LabTrends({ records }: { records: VaultRecord[] }) {
  const seriesList = collectLabSeries(records)
  const multi = seriesList.filter((s) => s.points.length >= 2)
  const single = seriesList.filter((s) => s.points.length < 2)

  if (seriesList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No numeric lab values yet. Upload lab reports to see trends over time.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {multi.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {multi.map((s) => (
            <SeriesChart key={s.test} series={s} />
          ))}
        </div>
      ) : null}
      {single.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Single data points (need ≥2 reports to trend)
          </h3>
          <div className="flex flex-wrap gap-2">
            {single.map((s) => (
              <Badge key={s.test} variant="outline" className="capitalize">
                {s.test}: {s.points[0].raw} {s.unit}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
