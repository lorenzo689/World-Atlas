import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import type { DataPoint, IndicatorSeries } from '@/types'
import { INDICATORS, SOURCE_NAME, sourceUrl, type IndicatorKey } from '@/lib/indicators'
import type { SeriesMap } from '@/hooks/useIndicator'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { CHART_COLORS, TimeSeriesChart, type ChartSeries, type ChartVariant } from './TimeSeriesChart'

const PALETTE = Object.values(CHART_COLORS)

export type Range = 10 | 25 | 'all'

export function applyRange(points: DataPoint[], range: Range): DataPoint[] {
  if (range === 'all' || points.length === 0) return points
  const last = points[points.length - 1].year
  return points.filter((p) => p.year > last - range)
}

interface IndicatorCardProps {
  title: string
  description?: string
  keys: IndicatorKey[]
  data: SeriesMap | null
  loading: boolean
  error?: Error | null
  onRetry?: () => void
  variant?: ChartVariant
  range: Range
  colors?: string[]
  zeroLine?: boolean
  height?: number
  className?: string
}

/** Chart card with title, unit, data-year note and source attribution. */
export function IndicatorCard({
  title,
  description,
  keys,
  data,
  loading,
  error,
  onRetry,
  variant = 'line',
  range,
  colors,
  zeroLine,
  height = 260,
  className,
}: IndicatorCardProps) {
  const metas = keys.map((k) => INDICATORS[k])
  const series: ChartSeries[] = useMemo(
    () =>
      keys.flatMap((k, i) => {
        const s: IndicatorSeries | undefined = data?.[k]
        if (!s || s.points.length === 0) return []
        return [{ key: k, label: INDICATORS[k].short, points: applyRange(s.points, range), color: colors?.[i] ?? PALETTE[i % PALETTE.length] }]
      }),
    [keys, data, range, colors],
  )
  const first = metas[0]
  const years = series.flatMap((s) => s.points.map((p) => p.year))
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : null
  const unit = metas.length === 1 ? first.unit : metas.every((m) => m.unit === first.unit) ? first.unit : 'see legend'

  return (
    <section className={`rounded-3xl border border-border bg-white/[0.02] p-5 sm:p-6 ${className ?? ''}`}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{unit}</p>
      </header>
      {description && <p className="-mt-2 mb-4 text-xs leading-relaxed text-muted-foreground">{description}</p>}

      {loading ? (
        <Skeleton style={{ height }} className="w-full" />
      ) : error ? (
        <ErrorState compact title="Data unavailable" message={error.message} onRetry={onRetry} className="h-[200px]" />
      ) : series.length === 0 ? (
        <EmptyState className="h-[200px]">The World Bank has no published values for this indicator and country.</EmptyState>
      ) : (
        <>
          {series.length > 1 && (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          <TimeSeriesChart
            series={series}
            variant={variant}
            format={(v) => first.format(v)}
            tick={first.tick}
            zeroLine={zeroLine}
            height={height}
            ariaLabel={`${title}, ${span ?? ''}`}
          />
        </>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {span && <span className="tabular">Data years {span}</span>}
        <span aria-hidden>·</span>
        <a
          href={sourceUrl(first.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
        >
          {SOURCE_NAME} <ExternalLink className="size-3" aria-hidden />
        </a>
        <span className="tabular opacity-70">{metas.map((m) => m.id).join(', ')}</span>
      </footer>
    </section>
  )
}

export function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const opts: { v: Range; label: string }[] = [
    { v: 10, label: '10 yrs' },
    { v: 25, label: '25 yrs' },
    { v: 'all', label: 'All' },
  ]
  return (
    <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-full border border-border p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            value === o.v ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({
  label,
  value,
  year,
  unit,
  loading,
}: {
  label: string
  value: string
  year?: number | null
  unit?: string
  loading?: boolean
}) {
  return (
    <div className="rounded-3xl border border-border bg-white/[0.02] p-5">
      <p className="eyebrow">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-28" />
      ) : (
        <p className="tabular mt-2 font-serif text-[34px] leading-none tracking-tight">{value}</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {loading ? ' ' : [unit, year ? `${year}` : value === '—' ? 'No data' : null].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}
