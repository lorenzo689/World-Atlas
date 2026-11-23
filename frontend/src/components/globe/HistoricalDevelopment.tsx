import { useId } from 'react'
import { useLang, type Lang } from '@/i18n'
import { HISTORY_EVENTS } from '@/lib/historyCompare'
import {
  adjacentPeriodYears, changeFromPrevious, compareEntity, dayToIso, eventsForEntity, nameSegments,
  nearestPresence, periodAt, periodSource, presenceRanges, type EntityPeriod,
} from '@/lib/historyEntity'
import { formatHistoricalDate } from '@/lib/timeMachine'

export interface FlagRecord { file: string; start: string | null; end: string | null }

export interface HistoricalDevelopmentProps {
  code: string
  periods: EntityPeriod[]
  /** The 1 January map currently shown (the Time Machine year). */
  year: number
  compareYear: number | null
  flags: FlagRecord[]
  /** The area comparison of the shown years could not be computed for this identifier. */
  areaFailed?: boolean
  onYearChange: (year: number) => void
  onCompare: (year: number) => void
}

const TEXT = {
  en: {
    heading: 'Development in the dataset',
    mapDate: (d: string) => `Map date: ${d}. Maps show borders on 1 January.`,
    inPeriod: (from: string, to: string) => `In this snapshot: dataset period ${from} – ${to}.`,
    absent: (d: string) => `Not in the ${d} snapshot.`,
    absentNote: 'The dataset has no record for this identifier on that day. This alone does not mean that the state did not exist.',
    show: (d: string) => `Show ${d}`,
    earlier: 'Earlier period', later: 'Later period',
    earlierAria: (d: string) => `Earlier dataset period: map of ${d}`,
    laterAria: (d: string) => `Later dataset period: map of ${d}`,
    compareWith: (d: string) => `Compare with ${d}`,
    presence: 'In the 1 January maps',
    noPresence: 'No 1 January map shows this identifier.',
    labels: 'Labels on the map',
    sourceLabel: (names: string) => `Label in CShapes: ${names}. The atlas clarifies this single label for a few identifiers.`,
    periods: (n: number) => `Dataset periods (${n})`,
    periodNote: 'A new period is a new record of the dataset, or a processing split. It is not by itself a regime change or a border shift.',
    maps: (a: number, b: number) => a === b ? `Map ${a}` : `Maps ${a}–${b}`,
    noMap: 'No 1 January map in this period',
    capital: 'Capital', unknown: 'not recorded',
    capitalChanged: 'Capital differs from the previous period',
    geometryChanged: 'Dataset geometry differs from the previous period',
    geometrySame: 'Dataset geometry identical to the previous period',
    gap: 'Gap in the dataset before this period',
    wartime: '1939–1945: may be a split by the WWII annexation correction',
    ohm: 'Geometry: OpenHistoricalMap reconstruction (annexed territory, not occupation)',
    current: 'shown now',
    flags: 'Dated flags (Wikimedia Commons FlagsData)',
    noFlags: 'No dated flag record for this identifier.',
    flagShown: 'on this map date',
    open: 'open-ended',
    events: 'Documented events',
    eventDate: (d: string) => `Event date: ${d}`,
    eventNote: 'Event dates and dataset period boundaries are separate: the maps compare 1 January snapshots before and after the event.',
    compareEvent: (a: string, b: string) => `Compare ${a} and ${b}`,
    primary: 'Primary source ↗',
    comparison: (a: string, b: string) => `Comparison: ${a} and ${b}`,
    inSnapshot: 'In snapshot', yes: 'yes', notIn: 'not in this snapshot',
    label: 'Label', period: 'Dataset period', geometry: 'Geometry',
    identical: 'identical in the dataset', different: 'differs in the dataset', notComparable: 'not comparable: missing in one snapshot',
    shared: 'Same dataset identifier in both snapshots. CShapes can keep one identifier across successive regimes, so this is no evidence of state continuity.',
    globeNote: 'Lines and shaded areas on the two globes show geometric differences of all states between both snapshots. They do not establish ownership, sovereignty or control.',
    areaFailed: 'The area comparison could not be computed for this identifier; border lines remain visible.',
    sources: 'Sources and uncertainty',
    sourceList: [
      'Periods, capitals and labels: CShapes 2.0, a scholarly reconstruction with its own coding thresholds.',
      'Missing records are not interpolated. Disputed and dependent territories follow the source’s coding.',
    ],
    ohmSource: 'OpenHistoricalMap (CC0) for the corrected 1939–1945 Reich footprint and the Free City of Danzig.',
  },
  de: {
    heading: 'Entwicklung im Datensatz',
    mapDate: (d: string) => `Kartenstichtag: ${d}. Die Karten zeigen Grenzen am 1. Januar.`,
    inPeriod: (from: string, to: string) => `In diesem Snapshot: Datensatzperiode ${from} – ${to}.`,
    absent: (d: string) => `Nicht im Snapshot vom ${d}.`,
    absentNote: 'Der Datensatz hat für diese Kennung an diesem Tag keinen Eintrag. Das allein bedeutet nicht, dass der Staat nicht existierte.',
    show: (d: string) => `${d} zeigen`,
    earlier: 'Früherer Abschnitt', later: 'Späterer Abschnitt',
    earlierAria: (d: string) => `Frühere Datensatzperiode: Karte vom ${d}`,
    laterAria: (d: string) => `Spätere Datensatzperiode: Karte vom ${d}`,
    compareWith: (d: string) => `Mit ${d} vergleichen`,
    presence: 'In den Karten zum 1. Januar',
    noPresence: 'Keine Karte zum 1. Januar zeigt diese Kennung.',
    labels: 'Bezeichnungen auf der Karte',
    sourceLabel: (names: string) => `Bezeichnung in CShapes: ${names}. Der Atlas präzisiert diese eine Bezeichnung für einige Kennungen.`,
    periods: (n: number) => `Datensatzperioden (${n})`,
    periodNote: 'Eine neue Periode ist ein neuer Eintrag im Datensatz oder eine Aufteilung bei der Verarbeitung. Sie ist für sich kein Regimewechsel und keine Grenzverschiebung.',
    maps: (a: number, b: number) => a === b ? `Karte ${a}` : `Karten ${a}–${b}`,
    noMap: 'Keine Karte zum 1. Januar in dieser Periode',
    capital: 'Hauptstadt', unknown: 'nicht erfasst',
    capitalChanged: 'Hauptstadt anders als in der vorherigen Periode',
    geometryChanged: 'Datensatzgeometrie anders als in der vorherigen Periode',
    geometrySame: 'Datensatzgeometrie identisch mit der vorherigen Periode',
    gap: 'Lücke im Datensatz vor dieser Periode',
    wartime: '1939–1945: möglicherweise Aufteilung durch die Korrektur der Reichsannexionen',
    ohm: 'Geometrie: Rekonstruktion nach OpenHistoricalMap (annektiertes Gebiet, keine Besatzung)',
    current: 'aktuell gezeigt',
    flags: 'Datierte Flaggen (Wikimedia Commons FlagsData)',
    noFlags: 'Kein datierter Flaggeneintrag für diese Kennung.',
    flagShown: 'an diesem Kartenstichtag',
    open: 'ohne Enddatum',
    events: 'Belegte Ereignisse',
    eventDate: (d: string) => `Ereignisdatum: ${d}`,
    eventNote: 'Ereignisdatum und Grenzen der Datensatzperioden sind getrennt: Die Karten vergleichen Snapshots zum 1. Januar vor und nach dem Ereignis.',
    compareEvent: (a: string, b: string) => `${a} und ${b} vergleichen`,
    primary: 'Primärquelle ↗',
    comparison: (a: string, b: string) => `Vergleich: ${a} und ${b}`,
    inSnapshot: 'Im Snapshot', yes: 'ja', notIn: 'nicht in diesem Snapshot',
    label: 'Bezeichnung', period: 'Datensatzperiode', geometry: 'Geometrie',
    identical: 'im Datensatz identisch', different: 'im Datensatz verschieden', notComparable: 'nicht vergleichbar: fehlt in einem Snapshot',
    shared: 'Gleiche Datensatzkennung in beiden Snapshots. CShapes kann eine Kennung über aufeinanderfolgende Regime beibehalten; das ist kein Beleg für staatliche Kontinuität.',
    globeNote: 'Linien und Flächen auf den beiden Globen zeigen geometrische Unterschiede aller Staaten zwischen beiden Snapshots. Sie belegen keine Besitz-, Souveränitäts- oder Kontrollverhältnisse.',
    areaFailed: 'Der Flächenvergleich konnte für diese Kennung nicht berechnet werden; die Grenzlinien bleiben sichtbar.',
    sources: 'Quellen und Unsicherheit',
    sourceList: [
      'Perioden, Hauptstädte und Bezeichnungen: CShapes 2.0, eine wissenschaftliche Rekonstruktion mit eigenen Erfassungsschwellen.',
      'Fehlende Einträge werden nicht interpoliert. Umstrittene und abhängige Gebiete folgen der Kodierung der Quelle.',
    ],
    ohmSource: 'OpenHistoricalMap (CC0) für die korrigierte Reichsfläche 1939–1945 und die Freie Stadt Danzig.',
  },
} satisfies Record<Lang, unknown>

const jan1 = (year: number, lang: Lang) => formatHistoricalDate(`${year}-01-01`, lang)
const day = (value: number, lang: Lang) => formatHistoricalDate(dayToIso(value), lang)
const chip = 'rounded-full border border-input px-2.5 py-1 text-xs hover:border-primary disabled:opacity-40'

export function HistoricalDevelopment({ code, periods, year, compareYear, flags, areaFailed = false, onYearChange, onCompare }: HistoricalDevelopmentProps) {
  const lang = useLang((s) => s.lang)
  const x = TEXT[lang]
  const headingId = useId()
  const current = periodAt(periods, year)
  const { before, after } = nearestPresence(periods, year)
  const adjacent = adjacentPeriodYears(periods, year)
  const ranges = presenceRanges(periods)
  const names = nameSegments(code, periods)
  const sourceNames = [...new Set(periods.map((p) => p.sourceName))]
  const events = eventsForEntity(code).map((id) => HISTORY_EVENTS.find((e) => e.id === id)).filter((e) => !!e)
  const hasOhm = periods.some((p) => periodSource(code, p) === 'ohm')
  const firstDay = periods[0] ? dayToIso(periods[0].start) : null
  const lastDay = periods.at(-1) ? dayToIso(periods.at(-1)!.end) : null
  const relevantFlags = flags.filter((f) => (!f.end || !firstDay || f.end > firstDay) && (!f.start || !lastDay || f.start <= lastDay))
  const mapDay = `${year}-01-01`
  const shownFlag = [...flags].filter((f) => f.start && f.start <= mapDay && (!f.end || mapDay < f.end)).sort((a, b) => b.start!.localeCompare(a.start!))[0]
  const comparison = compareYear != null && compareYear !== year ? compareEntity(code, periods, year, compareYear) : null

  return (
    <section className="mt-6 rounded-2xl border border-border bg-background/45 p-4 text-sm" aria-labelledby={headingId} data-testid="entity-development">
      <h3 id={headingId} className="font-serif text-lg">{x.heading}</h3>
      <p className="mt-1 text-xs text-muted-foreground" data-testid="entity-map-date">{x.mapDate(jan1(year, lang))}</p>

      {current ? (
        <p className="mt-2 text-xs" data-testid="entity-current">{x.inPeriod(day(current.start, lang), day(current.end, lang))}</p>
      ) : (
        <div className="mt-2 rounded-xl border border-amber-300/50 bg-amber-300/10 p-3 text-xs" role="status" data-testid="entity-absent">
          <p className="font-medium">{x.absent(jan1(year, lang))}</p>
          <p className="mt-1 text-muted-foreground">{x.absentNote}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {before != null && <button type="button" className={chip} onClick={() => onYearChange(before)}>{x.show(jan1(before, lang))}</button>}
            {after != null && <button type="button" className={chip} onClick={() => onYearChange(after)}>{x.show(jan1(after, lang))}</button>}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={chip} disabled={adjacent.previous == null}
          aria-label={adjacent.previous != null ? x.earlierAria(jan1(adjacent.previous, lang)) : x.earlier}
          onClick={() => adjacent.previous != null && onYearChange(adjacent.previous)}>← {x.earlier}{adjacent.previous != null ? ` (${adjacent.previous})` : ''}</button>
        <button type="button" className={chip} disabled={adjacent.next == null}
          aria-label={adjacent.next != null ? x.laterAria(jan1(adjacent.next, lang)) : x.later}
          onClick={() => adjacent.next != null && onYearChange(adjacent.next)}>{x.later}{adjacent.next != null ? ` (${adjacent.next})` : ''} →</button>
        {compareYear == null && adjacent.previous != null && <button type="button" className={chip} onClick={() => onCompare(adjacent.previous!)}>{x.compareWith(jan1(adjacent.previous, lang))}</button>}
        {compareYear == null && adjacent.next != null && <button type="button" className={chip} onClick={() => onCompare(adjacent.next!)}>{x.compareWith(jan1(adjacent.next, lang))}</button>}
      </div>

      {comparison && (
        <div className="mt-4 rounded-xl border border-primary/40 p-3 text-xs" data-testid="entity-comparison">
          <h4 className="font-medium">{x.comparison(jan1(comparison.a.year, lang), jan1(comparison.b.year, lang))}</h4>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="tabular text-muted-foreground">
                <td />
                <th scope="col" className="font-normal">{comparison.a.year}</th>
                <th scope="col" className="font-normal">{comparison.b.year}</th>
              </tr>
            </thead>
            <tbody>
            {([
              [x.inSnapshot, comparison.a.period ? x.yes : x.notIn, comparison.b.period ? x.yes : x.notIn],
              [x.label, comparison.a.label ?? '—', comparison.b.label ?? '—'],
              [x.period, comparison.a.period ? `${day(comparison.a.period.start, lang)} – ${day(comparison.a.period.end, lang)}` : '—', comparison.b.period ? `${day(comparison.b.period.start, lang)} – ${day(comparison.b.period.end, lang)}` : '—'],
              [x.capital, comparison.a.period ? comparison.a.period.capital ?? x.unknown : '—', comparison.b.period ? comparison.b.period.capital ?? x.unknown : '—'],
            ] as const).map(([term, a, b]) => (
              <tr key={term} className="align-top">
                <th scope="row" className="pr-3 font-normal text-muted-foreground">{term}</th>
                <td className="pr-2">{a}</td>
                <td>{b}</td>
              </tr>
            ))}
            </tbody>
          </table>
          <p className="mt-2" data-testid="entity-geometry">
            {x.geometry}: {comparison.geometryIdentical == null ? x.notComparable : comparison.geometryIdentical ? x.identical : x.different}
          </p>
          {comparison.sharedIdentifier && <p className="mt-1 text-muted-foreground" data-testid="entity-shared-id">{x.shared}</p>}
          <p className="mt-1 text-muted-foreground">{x.globeNote}</p>
          {areaFailed && <p className="mt-1 text-destructive" role="status">{x.areaFailed}</p>}
        </div>
      )}

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.presence}</h4>
      <p className="tabular mt-1 text-xs" data-testid="entity-presence">{ranges.length ? ranges.map(([a, b]) => a === b ? `${a}` : `${a}–${b}`).join(', ') : x.noPresence}</p>

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.labels}</h4>
      <ul className="mt-1 space-y-0.5 text-xs" data-testid="entity-labels">
        {names.map((n) => <li key={`${n.from}-${n.label}`}><span className="tabular text-muted-foreground">{n.from === n.to ? n.from : `${n.from}–${n.to}`}</span> · {n.label}</li>)}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">{x.sourceLabel(sourceNames.join(', '))}</p>

      <details className="mt-4" open={periods.length <= 6}>
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.periods(periods.length)}</summary>
        <p className="mt-1 text-[11px] text-muted-foreground">{x.periodNote}</p>
        <ol className="mt-2 space-y-2" data-testid="entity-periods">
          {periods.map((p, i) => {
            const change = changeFromPrevious(periods[i - 1], p)
            const isCurrent = current?.period === p.period
            return (
              <li key={p.period} aria-current={isCurrent ? 'true' : undefined}
                className={`rounded-xl border px-3 py-2 text-xs ${isCurrent ? 'border-primary' : 'border-border'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="tabular font-medium">{day(p.start, lang)} – {day(p.end, lang)}</span>
                  {isCurrent && <span className="text-primary">{x.current}</span>}
                </div>
                <p className="mt-0.5 text-muted-foreground">{p.firstYear != null ? x.maps(p.firstYear, p.lastYear!) : x.noMap} · {x.capital}: {p.capital ?? x.unknown}</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {change.gapBefore && <li className="text-amber-300">{x.gap}</li>}
                  {change.capitalChanged && <li>{x.capitalChanged}</li>}
                  {change.geometryChanged != null && <li>{change.geometryChanged ? x.geometryChanged : x.geometrySame}</li>}
                  {change.wartimeSplit && <li>{x.wartime}</li>}
                  {periodSource(code, p) === 'ohm' && <li>{x.ohm}</li>}
                </ul>
                {p.firstYear != null && p.firstYear !== year && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button type="button" className={chip} onClick={() => onYearChange(p.firstYear!)}>{x.show(jan1(p.firstYear, lang))}</button>
                    {compareYear == null && <button type="button" className={chip} onClick={() => onCompare(p.firstYear!)}>{x.compareWith(jan1(p.firstYear, lang))}</button>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </details>

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.flags}</h4>
      {relevantFlags.length ? (
        <ul className="mt-1 space-y-0.5 text-xs" data-testid="entity-flags">
          {relevantFlags.map((f) => (
            <li key={`${f.file}-${f.start}`} className={f === shownFlag ? 'text-primary' : undefined}>
              <span className="tabular text-muted-foreground">{f.start ? formatHistoricalDate(f.start, lang) : '?'} – {f.end ? formatHistoricalDate(f.end, lang) : x.open}</span>
              {' · '}{f.file.replace(/\.svg$/i, '')}{f === shownFlag ? ` (${x.flagShown})` : ''}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-xs text-muted-foreground">{x.noFlags}</p>}

      {events.length > 0 && (
        <>
          <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.events}</h4>
          <p className="mt-1 text-[11px] text-muted-foreground">{x.eventNote}</p>
          <ul className="mt-2 space-y-2 text-xs" data-testid="entity-events">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-border px-3 py-2">
                <strong className="font-medium">{event.title[lang]}</strong>
                <p className="mt-0.5 text-muted-foreground"><time dateTime={event.date}>{x.eventDate(formatHistoricalDate(event.date, lang))}</time></p>
                <p className="mt-0.5">{event.detail[lang]}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button type="button" className={chip} onClick={() => { onYearChange(event.before); onCompare(event.after) }}>{x.compareEvent(jan1(event.before, lang), jan1(event.after, lang))}</button>
                  <a className="text-primary hover:underline" href={event.source} target="_blank" rel="noreferrer">{x.primary}</a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.sources}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
        {x.sourceList.map((line) => <li key={line}>{line}</li>)}
        {hasOhm && <li>{x.ohmSource}</li>}
      </ul>
    </section>
  )
}
