import { useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DataPoint } from '@/types'

export const CHART_COLORS = {
  primary: '#6fa8ff',
  mint: '#6fd9bd',
  amber: '#f0b76a',
  rose: '#f08a8a',
  violet: '#a99bf0',
}

export interface ChartSeries {
  key: string
  label: string
  points: DataPoint[]
  color?: string
}

export type ChartVariant = 'area' | 'line' | 'bar' | 'stacked-area'

interface TimeSeriesChartProps {
  series: ChartSeries[]
  variant?: ChartVariant
  format: (v: number) => string
  tick: (v: number) => string
  height?: number
  /** Show a zero baseline (useful for growth / inflation that can be negative). */
  zeroLine?: boolean
  ariaLabel: string
}

type Row = Record<string, number | undefined> & { year: number }

const AXIS = { stroke: 'rgba(160,190,235,0.35)', fontSize: 11 }

function ChartTooltip({
  active,
  label,
  payload,
  series,
  format,
}: {
  active?: boolean
  label?: number | string
  payload?: { dataKey?: string | number; value?: number; color?: string }[]
  series: ChartSeries[]
  format: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-[#0b1320]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <p className="tabular mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey)
        if (!s || p.value == null) return null
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {series.length > 1 && <span>{s.label}</span>}
            <span className="tabular ml-auto pl-3 font-medium text-foreground">{format(p.value)}</span>
          </p>
        )
      })}
    </div>
  )
}

/** Responsive year-based chart. Gaps in the source data stay gaps; nothing is interpolated. */
export function TimeSeriesChart({
  series,
  variant = 'line',
  format,
  tick,
  height = 260,
  zeroLine,
  ariaLabel,
}: TimeSeriesChartProps) {
  const uid = useId().replace(/:/g, '')
  const rows = useMemo(() => {
    const byYear = new Map<number, Row>()
    for (const s of series) {
      for (const p of s.points) {
        const r: Row = byYear.get(p.year) ?? { year: p.year }
        r[s.key] = p.value
        byYear.set(p.year, r)
      }
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year)
  }, [series])

  const colored = series.map((s, i) => ({
    ...s,
    color: s.color ?? Object.values(CHART_COLORS)[i % 5],
  }))

  const common = {
    data: rows,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  }
  const axes = (
    <>
      <CartesianGrid stroke="rgba(160,190,235,0.08)" vertical={false} />
      <XAxis
        dataKey="year"
        {...AXIS}
        tickLine={false}
        axisLine={false}
        minTickGap={32}
        tickMargin={8}
        interval="preserveStartEnd"
      />
      <YAxis
        {...AXIS}
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={tick}
        domain={variant === 'stacked-area' ? [0, 100] : variant === 'area' ? [0, 'auto'] : ['auto', 'auto']}
      />
      <Tooltip
        cursor={{ stroke: 'rgba(160,190,235,0.35)', strokeDasharray: '3 3' }}
        content={<ChartTooltip series={colored} format={format} />}
        isAnimationActive={false}
      />
      {zeroLine && <ReferenceLine y={0} stroke="rgba(160,190,235,0.3)" />}
    </>
  )

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'bar' ? (
          <BarChart {...common}>
            {axes}
            {colored.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : variant === 'line' ? (
          <LineChart {...common}>
            {axes}
            {colored.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              {colored.map((s) => (
                <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={variant === 'stacked-area' ? 0.75 : 0.4} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={variant === 'stacked-area' ? 0.35 : 0.02} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {colored.map((s) => (
              <Area
                key={s.key}
                dataKey={s.key}
                stackId={variant === 'stacked-area' ? 'a' : undefined}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#${uid}-${s.key})`}
                connectNulls
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
