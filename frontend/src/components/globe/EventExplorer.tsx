import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Play, Square, X } from 'lucide-react'
import { useLang, type Lang } from '@/i18n'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from '@/lib/history'
import {
  EVENT_TOURS, REGIONS, THEMES, eventById, mapRelation, snapshotYears, warMomentFor,
  type EventFilter, type EventRegion, type EventTheme, type HistoricalEvent,
} from '@/lib/historicalEvents'
import { formatHistoricalDate } from '@/lib/timeMachine'
import { scenarioHref } from '@/lib/scenarios'

export interface TourState {
  /** A curated tour id, or "results" for a tour of the current filter results. */
  id: string
  eventIds: string[]
  index: number
  playing: boolean
}

interface Props {
  /** The shown 1 January map (Time Machine year). */
  year: number
  events: HistoricalEvent[]
  /** Events after filtering; the list and the globe markers. */
  results: HistoricalEvent[]
  filter: EventFilter
  onFilterChange: (filter: EventFilter) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  tour: TourState | null
  onTourStart: (id: string) => void
  onTourStep: (index: number) => void
  onTourPlay: (playing: boolean) => void
  onTourEnd: () => void
  /** Map data is not available: the list still works, map actions are disabled. */
  mapError?: boolean
  onShowYear: (year: number) => void
  onCompare: (before: number, after: number) => void
  onOpenLesson: (id: string) => void
  onOpenEntity: (code: string) => void
  entityLabel: (code: string) => string
  onClose: () => void
}

const TEXT = {
  en: {
    title: 'Historical events', close: 'Close events',
    search: 'Search events', region: 'Region', theme: 'Theme', period: 'Period', from: 'From year', to: 'To year',
    regions: { europe: 'Europe', africa: 'Africa', 'asia-pacific': 'Asia & Pacific', americas: 'Americas' } as Record<EventRegion, string>,
    themes: { war: 'War', statehood: 'Statehood', diplomacy: 'Diplomacy' } as Record<EventTheme, string>,
    count: (n: number, total: number) => `${n} of ${total} events`,
    empty: 'No event matches these filters.', reset: 'Reset filters',
    noPlace: 'no map position',
    tours: 'Guided time travel', tourResults: (n: number) => `Tour of these ${n} results`,
    step: (i: number, n: number) => `Step ${i} of ${n}`, previous: 'Previous event', next: 'Following event',
    play: 'Play tour', pause: 'Pause tour', end: 'End tour', progress: 'Tour progress',
    eventDate: (d: string) => `Event date: ${d}`,
    mapDate: (d: string) => `Map shown: ${d}`,
    before: (n: number) => `This map is ${n} days before the event and does not show its outcome.`,
    same: 'This map shows the event day (1 January).',
    after: (n: number) => `This map is ${n} days after the event. Changes on the map are not caused by the event just because they appear here.`,
    showAfter: (d: string) => `Show map of ${d}`,
    noAfter: (d: string) => `No later map exists; the nearest allowed map is ${d}, before the event.`,
    compare: (a: string, b: string) => `Compare ${a} and ${b}`,
    lesson: 'Open guided lesson', country: (name: string) => `Country explorer: ${name}`,
    war1: (year: number) => `In the World War I view this event belongs to ${year}; that view shows borders on 1 January ${year}.`,
    war2: (d: string) => `In the World War II view this event belongs to the moment of ${d}; that view shows borders on that exact day.`,
    openWar: (view: string) => `Open ${view} view`,
    ww1: 'World War I', ww2: 'World War II',
    source: 'Reference', noMarker: 'No documented place: listed without a globe marker.',
    marker: 'Marker: place anchor from the source catalog, not a precise site.',
    mapError: 'The historical map could not be loaded; events stay listed.',
    caveat: 'An event does not by itself prove a border change, annexation, occupation or succession.',
  },
  de: {
    title: 'Historische Ereignisse', close: 'Ereignisse schließen',
    search: 'Ereignisse durchsuchen', region: 'Region', theme: 'Thema', period: 'Zeitraum', from: 'Ab Jahr', to: 'Bis Jahr',
    regions: { europe: 'Europa', africa: 'Afrika', 'asia-pacific': 'Asien & Pazifik', americas: 'Amerika' } as Record<EventRegion, string>,
    themes: { war: 'Krieg', statehood: 'Staatlichkeit', diplomacy: 'Diplomatie' } as Record<EventTheme, string>,
    count: (n: number, total: number) => `${n} von ${total} Ereignissen`,
    empty: 'Kein Ereignis passt zu diesen Filtern.', reset: 'Filter zurücksetzen',
    noPlace: 'ohne Kartenposition',
    tours: 'Geführte Zeitreise', tourResults: (n: number) => `Zeitreise durch diese ${n} Treffer`,
    step: (i: number, n: number) => `Schritt ${i} von ${n}`, previous: 'Vorheriges Ereignis', next: 'Folgendes Ereignis',
    play: 'Zeitreise abspielen', pause: 'Zeitreise pausieren', end: 'Zeitreise beenden', progress: 'Fortschritt der Zeitreise',
    eventDate: (d: string) => `Ereignisdatum: ${d}`,
    mapDate: (d: string) => `Gezeigte Karte: ${d}`,
    before: (n: number) => `Diese Karte liegt ${n} Tage vor dem Ereignis und zeigt dessen Folgen nicht.`,
    same: 'Diese Karte zeigt den Ereignistag (1. Januar).',
    after: (n: number) => `Diese Karte liegt ${n} Tage nach dem Ereignis. Veränderungen auf der Karte sind nicht schon deshalb Folge des Ereignisses, weil sie hier erscheinen.`,
    showAfter: (d: string) => `Karte vom ${d} zeigen`,
    noAfter: (d: string) => `Es gibt keine spätere Karte; die nächste zulässige Karte ist vom ${d}, vor dem Ereignis.`,
    compare: (a: string, b: string) => `${a} und ${b} vergleichen`,
    lesson: 'Geführten Lernpfad öffnen', country: (name: string) => `Länder-Explorer: ${name}`,
    war1: (year: number) => `In der Ansicht Erster Weltkrieg gehört dieses Ereignis zu ${year}; diese Ansicht zeigt Grenzen am 1. Januar ${year}.`,
    war2: (d: string) => `In der Ansicht Zweiter Weltkrieg gehört dieses Ereignis zum Moment vom ${d}; diese Ansicht zeigt Grenzen an genau diesem Tag.`,
    openWar: (view: string) => `Ansicht ${view} öffnen`,
    ww1: 'Erster Weltkrieg', ww2: 'Zweiter Weltkrieg',
    source: 'Beleg', noMarker: 'Kein belegter Ort: ohne Globusmarker aufgeführt.',
    marker: 'Marker: Ortsanker aus dem Quellkatalog, kein genauer Schauplatz.',
    mapError: 'Die historische Karte konnte nicht geladen werden; die Ereignisse bleiben aufgelistet.',
    caveat: 'Ein Ereignis belegt für sich keine Grenzverschiebung, Annexion, Besatzung oder Staatsnachfolge.',
  },
} satisfies Record<Lang, unknown>

const chip = 'rounded-full border border-input px-2.5 py-1 text-xs hover:border-primary aria-pressed:border-primary aria-pressed:text-primary disabled:opacity-40'

export function EventExplorer(props: Props) {
  const { year, events, results, filter, onFilterChange, selectedId, onSelect, tour, mapError = false } = props
  const lang = useLang((s) => s.lang)
  const x = TEXT[lang]
  const listId = useId()
  const fmt = (date: string) => formatHistoricalDate(date, lang)
  const jan1 = (y: number) => fmt(`${y}-01-01`)
  const selected = eventById(selectedId)
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  const setYear = (key: 'from' | 'to', value: string) => {
    const n = Number(value)
    if (!/^\d{4}$/.test(value) || n < FIRST_HISTORICAL_YEAR || n > LAST_HISTORICAL_YEAR) return
    onFilterChange({ ...filter, [key]: n })
  }

  return (
    <section className="px-5 pb-6 pt-5 text-sm" aria-label={x.title} data-testid="event-explorer">
      <header className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-[26px] leading-tight">{x.title}</h2>
        <button type="button" onClick={props.onClose} aria-label={x.close} className="rounded-full p-1 hover:bg-white/10"><X className="size-4" /></button>
      </header>
      {mapError && <p role="alert" className="mt-2 text-xs text-destructive">{x.mapError}</p>}

      {/* Guided time travel */}
      <div className="mt-3 rounded-2xl border border-border p-3" data-testid="event-tours">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.tours}</h3>
        {tour ? (
          <div className="mt-2">
            <p className="font-medium">{tour.id === 'results' ? x.tourResults(tour.eventIds.length) : EVENT_TOURS.find((t) => t.id === tour.id)?.title[lang]}</p>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite" data-testid="tour-step">{x.step(tour.index + 1, tour.eventIds.length)}</p>
            <div role="progressbar" aria-label={x.progress} aria-valuemin={1} aria-valuemax={tour.eventIds.length} aria-valuenow={tour.index + 1}
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-primary" style={{ width: `${((tour.index + 1) / tour.eventIds.length) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={chip} disabled={tour.index === 0} onClick={() => props.onTourStep(tour.index - 1)}>← {x.previous}</button>
              <button type="button" className={`${chip} flex items-center gap-1`} disabled={mapError} onClick={() => props.onTourPlay(!tour.playing)}>
                {tour.playing ? <Pause aria-hidden className="size-3" /> : <Play aria-hidden className="size-3" />}{tour.playing ? x.pause : x.play}
              </button>
              <button type="button" className={chip} disabled={tour.index >= tour.eventIds.length - 1} onClick={() => props.onTourStep(tour.index + 1)}>{x.next} →</button>
              <button type="button" className={`${chip} flex items-center gap-1`} onClick={props.onTourEnd}><Square aria-hidden className="size-3" />{x.end}</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {EVENT_TOURS.map((t) => <button key={t.id} type="button" className={chip} title={t.description[lang]} onClick={() => props.onTourStart(t.id)}>{t.title[lang]}</button>)}
            {results.length >= 2 && <button type="button" className={chip} onClick={() => props.onTourStart('results')}>{x.tourResults(results.length)}</button>}
          </div>
        )}
      </div>

      {/* Selected event */}
      {selected && <EventDetail {...props} event={selected} x={x} fmt={fmt} jan1={jan1} lang={lang} year={year} />}

      {/* Filters */}
      <div className="mt-4 space-y-2" role="search">
        <input type="search" value={filter.query} aria-label={x.search} placeholder={x.search} aria-controls={listId}
          onChange={(e) => onFilterChange({ ...filter, query: e.target.value })}
          className="h-9 w-full rounded-full border border-input bg-background/60 px-3 text-sm" />
        <div role="group" aria-label={x.region} className="flex flex-wrap gap-1.5">
          {REGIONS.map((r) => <button key={r} type="button" className={chip} aria-pressed={filter.regions.includes(r)} onClick={() => onFilterChange({ ...filter, regions: toggle(filter.regions, r) })}>{x.regions[r]}</button>)}
        </div>
        <div role="group" aria-label={x.theme} className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => <button key={t} type="button" className={chip} aria-pressed={filter.themes.includes(t)} onClick={() => onFilterChange({ ...filter, themes: toggle(filter.themes, t) })}>{x.themes[t]}</button>)}
        </div>
        <div role="group" aria-label={x.period} className="flex items-center gap-2 text-xs">
          <input type="number" min={FIRST_HISTORICAL_YEAR} max={LAST_HISTORICAL_YEAR} defaultValue={filter.from} key={`from-${filter.from}`} aria-label={x.from}
            onBlur={(e) => setYear('from', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setYear('from', e.currentTarget.value) }}
            className="tabular h-8 w-20 rounded-full border border-input bg-background/60 px-2" />
          <span aria-hidden>–</span>
          <input type="number" min={FIRST_HISTORICAL_YEAR} max={LAST_HISTORICAL_YEAR} defaultValue={filter.to} key={`to-${filter.to}`} aria-label={x.to}
            onBlur={(e) => setYear('to', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setYear('to', e.currentTarget.value) }}
            className="tabular h-8 w-20 rounded-full border border-input bg-background/60 px-2" />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="event-count">{x.count(results.length, events.length)}</p>
      </div>

      {results.length ? (
        <ol id={listId} className="mt-2 space-y-1.5" data-testid="event-list">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" aria-pressed={e.id === selectedId} onClick={() => onSelect(e.id)}
                className="w-full rounded-xl border border-border px-3 py-2 text-left hover:border-primary aria-pressed:border-primary">
                <span className="block font-medium">{e.title[lang]}</span>
                <span className="tabular block text-xs text-muted-foreground">
                  <time dateTime={e.date}>{fmt(e.date)}</time> · {x.regions[e.region]}{e.location ? '' : ` · ${x.noPlace}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs" role="status" data-testid="event-empty">
          <p>{x.empty}</p>
          <button type="button" className="mt-2 text-primary underline" onClick={() => onFilterChange({ regions: [], themes: [], from: FIRST_HISTORICAL_YEAR, to: LAST_HISTORICAL_YEAR, query: '' })}>{x.reset}</button>
        </div>
      )}
    </section>
  )
}

type DetailProps = Props & {
  event: HistoricalEvent
  x: (typeof TEXT)[Lang]
  fmt: (date: string) => string
  jan1: (year: number) => string
  lang: Lang
}

function EventDetail({ event, x, fmt, jan1, lang, year, mapError, onShowYear, onCompare, onOpenLesson, onOpenEntity, entityLabel }: DetailProps) {
  const { before, after } = snapshotYears(event)
  const relation = mapRelation(event, year)
  const war = warMomentFor(event)
  const fallback = after == null && before != null ? before : null
  return (
    <article className="mt-4 rounded-2xl border border-primary/50 bg-background/80 p-3" data-testid="event-detail" aria-labelledby={`event-${event.id}`}>
      <h3 id={`event-${event.id}`} className="font-serif text-lg leading-snug">{event.title[lang]}</h3>
      <p className="mt-1 text-xs"><time dateTime={event.date} data-testid="event-date">{x.eventDate(fmt(event.date))}</time></p>
      <p className="text-xs text-muted-foreground" data-testid="event-map-date">{x.mapDate(jan1(year))}</p>
      <p className="mt-1 rounded-lg bg-white/5 px-2 py-1 text-xs" data-testid="event-relation">
        {relation.relation === 'before' ? x.before(relation.days) : relation.relation === 'same-day' ? x.same : x.after(relation.days)}
      </p>
      <p className="mt-2">{event.description[lang]}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{event.location ? x.marker : x.noMarker}</p>
      {war && <p className="mt-1 text-[11px] text-muted-foreground" data-testid="event-war-view">{war.view === 'ww1' ? x.war1(war.year) : x.war2(fmt(war.date))}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {after != null && after !== year && <button type="button" className={chip} disabled={mapError} onClick={() => onShowYear(after)}>{x.showAfter(jan1(after))}</button>}
        {fallback != null && fallback !== year && <button type="button" className={chip} disabled={mapError} onClick={() => onShowYear(fallback)}>{x.showAfter(jan1(fallback))}</button>}
        {event.compare && <button type="button" className={chip} disabled={mapError} onClick={() => onCompare(event.compare!.before, event.compare!.after)}>{x.compare(jan1(event.compare.before), jan1(event.compare.after))}</button>}
        {event.storyId && <button type="button" className={chip} disabled={mapError} onClick={() => onOpenLesson(event.storyId!)}>{x.lesson}</button>}
        {event.entities.map((code) => <button key={code} type="button" className={chip} disabled={mapError} onClick={() => onOpenEntity(code)}>{x.country(entityLabel(code))}</button>)}
        {war && <Link className={chip} to={scenarioHref(war.view, war.year)}>{x.openWar(x[war.view])}</Link>}
      </div>
      {fallback != null && <p className="mt-1 text-[11px] text-muted-foreground">{x.noAfter(jan1(fallback))}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">{x.caveat}</p>
      <p className="mt-1 text-xs">{x.source}: <a className="text-primary hover:underline" href={event.source.url} target="_blank" rel="noreferrer">{event.source.title} ↗</a></p>
    </article>
  )
}
