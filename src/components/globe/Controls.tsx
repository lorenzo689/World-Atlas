import { useEffect, useState } from 'react'
import { Layers, Map as MapIcon, Pause, Play, Satellite } from 'lucide-react'
import type { GlobeMode } from '@/types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { indicatorName } from '@/pages/DataPage'
import { DATA_MODE_METRICS, SOURCE_NAME, type IndicatorKey, type IndicatorMeta } from '@/lib/indicators'
import { DATA_RAMP, NO_DATA_COLOR, type ChoroplethScale } from '@/lib/color'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const MODES = [
  { id: 'satellite', icon: Satellite },
  { id: 'political', icon: MapIcon },
  { id: 'data', icon: Layers },
] as const satisfies readonly { id: GlobeMode; icon: unknown }[]

export function ModeSwitcher({ mode, onChange, className }: { mode: GlobeMode; onChange: (m: GlobeMode) => void; className?: string }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('explore.mode')} className={cn('glass inline-flex rounded-full p-1', className)}>
      {MODES.map(({ id, icon: Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(`mode.${id}.hint`)}
            onClick={() => onChange(id)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-all duration-300 sm:px-4',
              active
                ? 'bg-primary text-primary-foreground shadow-[0_6px_20px_-6px_rgba(111,168,255,0.7)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{t(`mode.${id}`)}</span>
          </button>
        )
      })}
    </div>
  )
}

interface DataPanelProps {
  metricKey: IndicatorKey
  onMetricChange: (k: IndicatorKey) => void
  meta: IndicatorMeta
  status: 'loading' | 'error' | 'success'
  scale: ChoroplethScale | null
  onRetry: () => void
  /** Time slider: `year = null` shows the latest value per country. */
  year: number | null
  onYearChange: (year: number | null) => void
  minYear: number
  maxYear: number
  yearStatus: 'loading' | 'error' | 'success'
  className?: string
}

export function DataPanel({
  metricKey,
  onMetricChange,
  meta,
  status,
  scale,
  onRetry,
  year,
  onYearChange,
  minYear,
  maxYear,
  yearStatus,
  className,
}: DataPanelProps) {
  const t = useT()
  const [playing, setPlaying] = useState(false)

  // play: advance one year per tick, stop at the end
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => onYearChange(year == null || year >= maxYear ? minYear : year + 1), 900)
    return () => clearInterval(id)
  }, [playing, year, minYear, maxYear, onYearChange])
  useEffect(() => {
    if (playing && year === maxYear) setPlaying(false)
  }, [playing, year, maxYear])

  return (
    <section aria-label={t('explore.dataLayer')} className={cn('glass animate-rise w-[min(21rem,calc(100vw-2rem))] rounded-3xl p-4', className)}>
      <p className="eyebrow mb-2">{t('explore.dataLayer')}</p>
      <Select value={metricKey} onValueChange={(v) => onMetricChange(v as IndicatorKey)}>
        <SelectTrigger aria-label={t('explore.indicator')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATA_MODE_METRICS.map((k) => (
            <SelectItem key={k} value={k}>
              {indicatorName(t, k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-4">
        {status === 'loading' && (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {status === 'error' && (
          <div role="alert" className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t('explore.dataError')}</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {status === 'success' && scale && (
          <>
            <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={t('explore.scale')}>
              {DATA_RAMP.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </div>
            <div className="tabular mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{meta.format(scale.breaks[0])}</span>
              <span>{meta.format(scale.breaks[scale.breaks.length - 1])}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="year-slider" className="eyebrow">{t('data.year')}</label>
          <span className="tabular text-foreground">
            {year ?? t('explore.latest')}
            {year != null && yearStatus === 'loading' && ' …'}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={playing ? t('data.pause') : t('data.play')}
            onClick={() => {
              if (!playing && (year == null || year >= maxYear)) onYearChange(minYear)
              setPlaying((p) => !p)
            }}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <input
            id="year-slider"
            type="range"
            min={minYear}
            max={maxYear + 1}
            step={1}
            value={year ?? maxYear + 1}
            onChange={(e) => {
              const v = Number(e.target.value)
              setPlaying(false)
              onYearChange(v > maxYear ? null : v)
            }}
            aria-valuetext={String(year ?? t('explore.latest'))}
            className="h-1.5 flex-1 cursor-pointer accent-[#6fa8ff]"
          />
        </div>
        {year != null && yearStatus === 'error' && (
          <p role="alert" className="mt-1.5 text-[11px] text-muted-foreground">{t('explore.yearError')}</p>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {year == null ? t('explore.dataNoteLatest', { label: meta.label }) : t('explore.dataNoteYear', { label: meta.label })}{' '}
        {t('explore.source', { source: SOURCE_NAME })}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: NO_DATA_COLOR }} /> {t('explore.noData')}
      </p>
    </section>
  )
}
