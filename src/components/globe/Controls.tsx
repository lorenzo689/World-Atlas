import { Layers, Map as MapIcon, Satellite } from 'lucide-react'
import type { GlobeMode } from '@/types'
import { cn } from '@/lib/utils'
import { DATA_MODE_METRICS, INDICATORS, SOURCE_NAME, type IndicatorKey, type IndicatorMeta } from '@/lib/indicators'
import { DATA_RAMP, NO_DATA_COLOR, type ChoroplethScale } from '@/lib/color'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const MODES: { id: GlobeMode; label: string; icon: typeof Satellite; hint: string }[] = [
  { id: 'satellite', label: 'Satellite', icon: Satellite, hint: 'Satellite imagery with country borders' },
  { id: 'political', label: 'Political', icon: MapIcon, hint: 'Countries coloured by world region' },
  { id: 'data', label: 'Data', icon: Layers, hint: 'Choropleth of a World Bank indicator' },
]

export function ModeSwitcher({ mode, onChange, className }: { mode: GlobeMode; onChange: (m: GlobeMode) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Globe mode" className={cn('glass inline-flex rounded-full p-1', className)}>
      {MODES.map(({ id, label, icon: Icon, hint }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={hint}
            onClick={() => onChange(id)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-all duration-300 sm:px-4',
              active
                ? 'bg-primary text-primary-foreground shadow-[0_6px_20px_-6px_rgba(111,168,255,0.7)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
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
  className?: string
}

export function DataPanel({ metricKey, onMetricChange, meta, status, scale, onRetry, className }: DataPanelProps) {
  return (
    <section aria-label="Data layer" className={cn('glass animate-rise w-[min(21rem,calc(100vw-2rem))] rounded-3xl p-4', className)}>
      <p className="eyebrow mb-2">Data layer</p>
      <Select value={metricKey} onValueChange={(v) => onMetricChange(v as IndicatorKey)}>
        <SelectTrigger aria-label="Indicator shown on the globe">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATA_MODE_METRICS.map((k) => (
            <SelectItem key={k} value={k}>
              {INDICATORS[k].short}
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
            <span>Couldn’t load World Bank data.</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
        {status === 'success' && scale && (
          <>
            <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label="Colour scale from low to high">
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

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {meta.label}. Latest available value per country; the reference year differs between countries and is shown on hover.
        Source: {SOURCE_NAME}.
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: NO_DATA_COLOR }} /> No data reported
      </p>
    </section>
  )
}
