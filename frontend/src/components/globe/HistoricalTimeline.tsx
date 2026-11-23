import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from '@/lib/history'
import type { HistoryEvent } from '@/lib/historyCompare'
import {
  PLAYBACK_SPEEDS, type PlaybackSpeed, clampHistoricalYear, nextPlaybackYear, parseHistoricalYear,
  playbackDelay, timelinePosition,
} from '@/lib/timeMachine'
import { useLang, useT } from '@/i18n'

interface Props {
  year: number | null
  onChange: (year: number | null) => void
  loading: boolean
  error: boolean
  onRetry: () => void
  onReset?: () => void
  resetLabel?: string
  allowToday?: boolean
  /** The current year is still being prepared (comparison areas, territory layers): playback holds the next step. */
  waiting?: boolean
  /** Why playback cannot continue safely (e.g. the comparison failed to update); pauses and disables playback. */
  blocked?: string | null
  /** Dated events shown as markers at their actual date and as selectable entries. */
  events?: HistoryEvent[]
  selectedEventId?: string | null
  onEventSelect?: (id: string) => void
}

const TRACK_LABELS = [FIRST_HISTORICAL_YEAR, 1945, 1991, LAST_HISTORICAL_YEAR]
const round = 'rounded-full border border-input hover:bg-white/10 disabled:opacity-40 motion-safe:transition-colors'

export function HistoricalTimeline({
  year, onChange, loading, error, onRetry, onReset, resetLabel, allowToday = true,
  waiting = false, blocked = null, events = [], selectedEventId = null, onEventSelect,
}: Props) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [ended, setEnded] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  // The year playback itself last requested; any other year change is manual and pauses playback.
  const expected = useRef<number | null>(null)
  const halted = error || !!blocked

  useEffect(() => {
    if (playing && year !== expected.current) setPlaying(false)
  }, [playing, year])

  useEffect(() => {
    if (halted) setPlaying(false)
  }, [halted])

  // One pending step at most: the next year is scheduled only after the current one is ready.
  useEffect(() => {
    if (!playing || waiting || halted || year == null) return
    const timer = window.setTimeout(() => {
      const next = nextPlaybackYear(year)
      if (next == null) { setPlaying(false); setEnded(true); return }
      expected.current = next
      onChange(next)
      if (nextPlaybackYear(next) == null) { setPlaying(false); setEnded(true) }
    }, playbackDelay(speed))
    return () => window.clearTimeout(timer)
  }, [playing, waiting, halted, year, speed, onChange])

  const change = (next: number | null) => {
    setPlaying(false)
    setEnded(false)
    onChange(next)
  }

  const togglePlay = () => {
    if (playing) { setPlaying(false); return }
    const start = year == null || year >= LAST_HISTORICAL_YEAR ? FIRST_HISTORICAL_YEAR : year
    expected.current = start
    setEnded(false)
    if (start !== year) onChange(start)
    setPlaying(true)
  }

  const commitDraft = () => {
    if (draft == null) return
    const parsed = parseHistoricalYear(draft)
    setDraft(null)
    setInvalid(parsed == null)
    if (parsed != null && parsed !== year) change(parsed)
  }

  const step = (delta: number) => year != null && change(clampHistoricalYear(year + delta))
  const status = blocked ?? (ended && year === LAST_HISTORICAL_YEAR ? t('history.ended', { year: LAST_HISTORICAL_YEAR })
    : playing && (waiting || loading) ? t('history.waiting') : loading ? t('history.loading') : '')

  return (
    <section
      className="glass w-[min(31rem,calc(100vw-2rem))] rounded-3xl p-4 shadow-2xl"
      aria-label={t('history.timeline')}
      onWheel={(event) => {
        if (event.deltaY === 0) return
        event.preventDefault()
        change(clampHistoricalYear((year ?? LAST_HISTORICAL_YEAR) + Math.sign(event.deltaY)))
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden className="size-4 text-primary" />
          <span className="eyebrow">{t('history.timeline')}</span>
        </div>
        <strong className="tabular font-serif text-2xl leading-none">{year ?? t('history.today')}</strong>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={`flex size-9 shrink-0 items-center justify-center ${round}`} aria-label={t('history.earlier')}
          disabled={year == null || year <= FIRST_HISTORICAL_YEAR} onClick={() => step(-1)}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          className={`flex size-9 shrink-0 items-center justify-center ${round}`}
          aria-label={playing ? t('data.pause') : t('data.play')}
          disabled={!playing && (loading || halted)}
          onClick={togglePlay}
        >
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </button>
        <button type="button" className={`flex size-9 shrink-0 items-center justify-center ${round}`} aria-label={t('history.later')}
          disabled={year == null || year >= LAST_HISTORICAL_YEAR} onClick={() => step(1)}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
        <form className="shrink-0" noValidate onSubmit={(event) => { event.preventDefault(); commitDraft() }}>
          <input
            type="number"
            inputMode="numeric"
            min={FIRST_HISTORICAL_YEAR}
            max={LAST_HISTORICAL_YEAR}
            step={1}
            value={draft ?? (year == null ? '' : String(year))}
            aria-label={t('history.goToYear')}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'history-year-invalid' : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            className="tabular h-9 w-[5.5rem] rounded-full border border-input bg-background/60 px-3 text-sm aria-[invalid=true]:border-destructive"
          />
        </form>
        <div role="group" aria-label={t('history.speed')} className="ml-auto flex shrink-0 gap-1">
          {PLAYBACK_SPEEDS.map((option) => (
            <button key={option} type="button" aria-pressed={speed === option} aria-label={t('history.speedOption', { speed: option })}
              onClick={() => setSpeed(option)}
              className={`${round} px-2 py-1 text-xs aria-pressed:border-primary aria-pressed:text-primary`}>
              {option}×
            </button>
          ))}
        </div>
      </div>
      {invalid && <p id="history-year-invalid" role="alert" className="mt-1 text-xs text-destructive">{t('history.yearInvalid', { first: FIRST_HISTORICAL_YEAR, last: LAST_HISTORICAL_YEAR })}</p>}

      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {events.length > 0 && (
            <div className="pointer-events-none absolute inset-x-2 -top-2 h-2" aria-hidden title={t('history.eventMarkers')}>
              {events.map((event) => (
                <span key={event.id} data-testid="event-marker" data-active={event.id === selectedEventId}
                  className="absolute top-0 h-2 w-[3px] -translate-x-1/2 rounded-full bg-amber-300 data-[active=true]:bg-white"
                  style={{ left: `${timelinePosition(event.date)}%` }} />
              ))}
            </div>
          )}
          <input
            type="range"
            min={FIRST_HISTORICAL_YEAR}
            max={LAST_HISTORICAL_YEAR}
            step={1}
            value={year ?? LAST_HISTORICAL_YEAR}
            aria-label={t('history.year')}
            aria-valuetext={String(year ?? t('history.today'))}
            onChange={(event) => change(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-[#6fa8ff]"
          />
          <div className="tabular relative mx-2 mt-1 h-3 text-[10px] text-muted-foreground" aria-hidden>
            {TRACK_LABELS.map((label) => (
              <span key={label} className="absolute -translate-x-1/2" style={{ left: `${timelinePosition(`${label}-01-01`)}%` }}>{label}</span>
            ))}
          </div>
        </div>
        {allowToday && <button type="button" onClick={() => change(null)} aria-pressed={year == null} className="rounded-full border border-input px-3 py-1.5 text-xs hover:bg-white/10 aria-pressed:border-primary aria-pressed:text-primary">
          {t('history.today')}
        </button>}
      </div>

      {events.length > 0 && onEventSelect && (
        <div role="group" aria-label={t('history.events')} className="mt-2 flex flex-wrap gap-2 text-xs">
          {events.map((event) => (
            <button key={event.id} type="button" aria-pressed={event.id === selectedEventId} title={event.detail[lang]}
              onClick={() => { setPlaying(false); setEnded(false); onEventSelect(event.id) }}
              className="flex items-center gap-1.5 rounded-xl border border-input px-2 py-1 text-left hover:border-primary aria-pressed:border-primary aria-pressed:text-primary motion-safe:transition-colors">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-300" />
              {event.date.slice(0, 4)} · {event.title[lang]}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 min-h-4 text-[11px] text-muted-foreground" aria-live="polite" data-testid="timeline-status">{status}</p>
      {year != null && <p className="text-[11px] text-muted-foreground">{t('history.snapshotNote')}</p>}
      {onReset && <button type="button" className="mt-2 text-xs text-primary underline" onClick={onReset}>{resetLabel}</button>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{t('history.loadError')} <button type="button" className="underline" onClick={onRetry}>{t('common.retry')}</button></p>}
    </section>
  )
}
