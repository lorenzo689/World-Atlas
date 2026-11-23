import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from './history'
import type { HistoryEvent } from './historyCompare'

/** Playback speeds of the "Changing borders" timeline; 1× advances one 1 January snapshot every 850 ms. */
export const PLAYBACK_SPEEDS = [0.5, 1, 2] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]
const BASE_DELAY_MS = 850

export function playbackDelay(speed: PlaybackSpeed): number {
  return Math.round(BASE_DELAY_MS / speed)
}

/** Clamp to the years that have a dated snapshot. Every year in the range has one (1 January). */
export function clampHistoricalYear(year: number): number {
  return Math.max(FIRST_HISTORICAL_YEAR, Math.min(LAST_HISTORICAL_YEAR, Math.round(year)))
}

/** The year playback shows next, or null when the end of the available range is reached. */
export function nextPlaybackYear(year: number): number | null {
  return year >= LAST_HISTORICAL_YEAR ? null : year + 1
}

/** Parses typed input; only whole years inside the snapshot range are accepted. */
export function parseHistoricalYear(value: string): number | null {
  if (!/^\s*\d{4}\s*$/.test(value)) return null
  const year = Number(value)
  return year >= FIRST_HISTORICAL_YEAR && year <= LAST_HISTORICAL_YEAR ? year : null
}

/** The map date of a timeline year: CShapes observations are taken on 1 January. */
export function snapshotDate(year: number): string {
  return `${year}-01-01`
}

/** Position of a dated event on the timeline track, 0–100 %, by its actual date (not its map snapshots). */
export function timelinePosition(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const year = y + ((m - 1) * 30.44 + (d - 1)) / 365.25
  const span = LAST_HISTORICAL_YEAR - FIRST_HISTORICAL_YEAR
  return Math.max(0, Math.min(100, ((year - FIRST_HISTORICAL_YEAR) / span) * 100))
}

/** Event date and the two map snapshots it is compared on. The snapshots are not the event date. */
export function eventDates(event: HistoryEvent): { event: string; before: string; after: string } {
  return { event: event.date, before: snapshotDate(event.before), after: snapshotDate(event.after) }
}

/** Formats an ISO day (YYYY-MM-DD) without time-zone shifts, e.g. "3 October 1990" / "3. Oktober 1990". */
export function formatHistoricalDate(date: string, lang: 'de' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
}
