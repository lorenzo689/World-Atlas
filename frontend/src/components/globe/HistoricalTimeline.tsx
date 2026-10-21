import { useEffect, useState } from 'react'
import { CalendarDays, Pause, Play } from 'lucide-react'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from '@/lib/history'
import { useT } from '@/i18n'

interface Props {
  year: number | null
  onChange: (year: number | null) => void
  loading: boolean
  error: boolean
  onRetry: () => void
  onReset?: () => void
  resetLabel?: string
  allowToday?: boolean
}

export function HistoricalTimeline({ year, onChange, loading, error, onRetry, onReset, resetLabel, allowToday = true }: Props) {
  const t = useT()
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (year == null || year >= LAST_HISTORICAL_YEAR) {
        setPlaying(false)
        return
      }
      onChange(year + 1)
    }, 850)
    return () => window.clearInterval(timer)
  }, [playing, year, onChange])

  const change = (next: number | null) => {
    setPlaying(false)
    onChange(next)
  }

  return (
    <section
      className="glass w-[min(31rem,calc(100vw-2rem))] rounded-3xl p-4 shadow-2xl"
      aria-label={t('history.timeline')}
      onWheel={(event) => {
        if (event.deltaY === 0) return
        event.preventDefault()
        change(Math.max(FIRST_HISTORICAL_YEAR, Math.min(LAST_HISTORICAL_YEAR, (year ?? LAST_HISTORICAL_YEAR) + Math.sign(event.deltaY))))
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 text-primary" />
          <span className="eyebrow">{t('history.timeline')}</span>
          {loading && <span className="text-xs text-muted-foreground">{t('history.loading')}</span>}
        </div>
        <strong className="tabular font-serif text-2xl leading-none">{year ?? t('history.today')}</strong>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-input hover:bg-white/10 disabled:opacity-40"
          aria-label={playing ? t('data.pause') : t('data.play')}
          disabled={loading || error}
          onClick={() => {
            if (year == null || year >= LAST_HISTORICAL_YEAR) onChange(FIRST_HISTORICAL_YEAR)
            setPlaying((p) => !p)
          }}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          type="range"
          min={FIRST_HISTORICAL_YEAR}
          max={LAST_HISTORICAL_YEAR}
          step={1}
          value={year ?? LAST_HISTORICAL_YEAR}
          aria-label={t('history.year')}
          aria-valuetext={String(year ?? t('history.today'))}
          onChange={(event) => change(Number(event.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-[#6fa8ff]"
        />
        {allowToday && <button type="button" onClick={() => change(null)} aria-pressed={year == null} className="rounded-full border border-input px-3 py-1.5 text-xs hover:bg-white/10 aria-pressed:border-primary aria-pressed:text-primary">
          {t('history.today')}
        </button>}
      </div>
      <div className="tabular mt-1 flex justify-between pl-11 pr-16 text-[10px] text-muted-foreground">
        <span>{FIRST_HISTORICAL_YEAR}</span><span>1945</span><span>1991</span><span>{LAST_HISTORICAL_YEAR}</span>
      </div>
      {year != null && <p className="mt-2 text-[11px] text-muted-foreground">{t('history.snapshotNote')}</p>}
      {onReset && <button type="button" className="mt-2 text-xs text-primary underline" onClick={onReset}>{resetLabel}</button>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{t('history.loadError')} <button type="button" className="underline" onClick={onRetry}>{t('common.retry')}</button></p>}
    </section>
  )
}
