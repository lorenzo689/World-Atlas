import type { Pose } from './geo'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR } from './history'
import { HISTORY_EVENTS } from './historyCompare'
import { storyForEvent } from './historyStories'
import { EVENT_ENTITIES } from './historyEntity'
import { WW1_MOMENTS } from './ww1'
import { WW2_MOMENTS } from './ww2'
import { ADDITIONAL_EVENTS } from './historicalEventsCatalog'

/**
 * Unified, read-only catalog of the dated events the atlas already cites (Changing borders lessons,
 * World War I and World War II learning views) plus a few separately sourced additions.
 *
 * The source catalogs keep their own structures; adapters below map them. Region and theme are UI
 * groupings for filtering, not historical classifications. An event never implies a border change:
 * only the curated Changing-borders lessons carry a before/after map comparison.
 */
export type Localized = { de: string; en: string }
export type EventRegion = 'europe' | 'africa' | 'middle-east' | 'asia-pacific' | 'americas'
export type EventTheme = 'war' | 'statehood' | 'diplomacy' | 'politics'
export type EventOrigin = 'borders' | 'ww1' | 'ww2' | 'catalog'

export interface HistoricalEvent {
  /** Stable, unique and URL-safe (`event=` deep links). */
  id: string
  /** Exact event day, YYYY-MM-DD. */
  date: string
  title: Localized
  description: Localized
  /** Place anchor given by the source catalog; null when no place is documented (list only, no marker). */
  location: { lat: number; lng: number } | null
  region: EventRegion
  themes: EventTheme[]
  source: { title: string; url: string }
  origin: EventOrigin
  /** Curated before/after 1 January snapshots (Changing-borders lessons only). */
  compare: { before: number; after: number } | null
  /** Guided lesson (HISTORY_STORIES) with its camera focus. */
  storyId: string | null
  /** Camera target: the place anchor, else the lesson focus, else none. */
  focus: Pose | null
  /** Dataset identifiers the event's own description names (Country Explorer), if any. */
  entities: string[]
}

export const REGIONS: EventRegion[] = ['europe', 'africa', 'middle-east', 'asia-pacific', 'americas']
export const THEMES: EventTheme[] = ['war', 'statehood', 'diplomacy', 'politics']

// UI grouping of the existing events by place; explicit so every event is reviewed once.
const REGION_BY_ID: Record<string, EventRegion> = {
  'german-unity': 'europe', 'soviet-union': 'europe', czechoslovakia: 'europe', 'south-sudan': 'africa',
  sarajevo: 'europe', tannenberg: 'europe', gallipoli: 'europe', lusitania: 'europe', verdun: 'europe', somme: 'europe',
  'us-entry': 'americas', zimmermann: 'americas', armistice: 'europe',
  'poland-invasion': 'europe', 'fall-france': 'europe', barbarossa: 'europe', 'pearl-harbor': 'asia-pacific',
  stalingrad: 'europe', 'el-alamein': 'africa', midway: 'asia-pacific', 'italy-1943': 'europe', normandy: 'europe',
  'berlin-1945': 'europe', 'okinawa-1945': 'asia-pacific', 'bergen-belsen-1945': 'europe',
}
const DIPLOMACY = new Set(['us-entry', 'zimmermann', 'armistice'])

/** Additional events, each checked against the cited page for its date (see docs/HISTORY.md). No page names a place, so none has a marker. */
const CATALOG_EVENTS: HistoricalEvent[] = [
  {
    id: 'india-pakistan-1947', date: '1947-08-15',
    title: { en: 'India and Pakistan become independent dominions', de: 'Indien und Pakistan werden unabhängige Dominions' },
    description: {
      en: 'From 15 August 1947 two independent Dominions, India and Pakistan, were set up under the Indian Independence Act 1947. This entry marks that day, not the Act itself, which received Royal Assent on 18 July 1947.',
      de: 'Ab dem 15. August 1947 bestanden nach dem Indian Independence Act 1947 zwei unabhängige Dominions, Indien und Pakistan. Dieser Eintrag bezeichnet diesen Tag, nicht das Gesetz selbst, das am 18. Juli 1947 die königliche Zustimmung erhielt.',
    },
    location: null, region: 'asia-pacific', themes: ['statehood'],
    source: { title: 'legislation.gov.uk · Indian Independence Act 1947, s. 1', url: 'https://www.legislation.gov.uk/ukpga/Geo6/10-11/30/enacted' },
    origin: 'catalog', compare: null, storyId: null, focus: null, entities: [],
  },
  {
    id: 'ghana-1957', date: '1957-03-06',
    title: { en: 'Ghana becomes independent', de: 'Ghana wird unabhängig' },
    description: {
      en: 'Ghana, formerly the Gold Coast, became independent from the United Kingdom on 6 March 1957, the date it marks as Independence Day.',
      de: 'Ghana, zuvor Goldküste, wurde am 6. März 1957 vom Vereinigten Königreich unabhängig; das Land begeht diesen Tag als Unabhängigkeitstag.',
    },
    location: null, region: 'africa', themes: ['statehood'],
    source: { title: 'Bank of Ghana · Independence Day', url: 'https://www.bog.gov.gh/holidays_calendar/independence-day/' },
    origin: 'catalog', compare: null, storyId: null, focus: null, entities: [],
  },
  {
    id: 'san-francisco-treaty-1951', date: '1951-09-08',
    title: { en: 'Treaty of Peace with Japan signed', de: 'Friedensvertrag mit Japan unterzeichnet' },
    description: {
      en: 'The San Francisco peace treaty with Japan was signed on 8 September 1951, the same day as the U.S.–Japan Security Treaty. This entry marks the signature, not the treaty’s later entry into force.',
      de: 'Der Friedensvertrag von San Francisco mit Japan wurde am 8. September 1951 unterzeichnet, am selben Tag wie der japanisch-amerikanische Sicherheitsvertrag. Dieser Eintrag bezeichnet die Unterzeichnung, nicht das spätere Inkrafttreten.',
    },
    location: null, region: 'asia-pacific', themes: ['diplomacy'],
    source: { title: 'U.S. Office of the Historian · Korean War and Japan’s Recovery', url: 'https://history.state.gov/milestones/1945-1952/korean-war' },
    origin: 'catalog', compare: null, storyId: null, focus: null, entities: [],
  },
]

const pointFocus = (location: { lat: number; lng: number }): Pose => ({ ...location, altitude: 0.9 })

function fromBorders(): HistoricalEvent[] {
  return HISTORY_EVENTS.map((e) => {
    const story = storyForEvent(e.id)
    return {
      id: e.id, date: e.date, title: e.title, description: e.detail,
      location: null, region: REGION_BY_ID[e.id], themes: ['statehood'],
      source: { title: new URL(e.source).hostname.replace(/^www\./, ''), url: e.source },
      origin: 'borders', compare: { before: e.before, after: e.after }, storyId: story ? e.id : null,
      focus: story ? { ...story.focus } : null, entities: EVENT_ENTITIES[e.id] ?? [],
    }
  })
}

function fromWw1(): HistoricalEvent[] {
  return WW1_MOMENTS.flatMap((m) => m.events.map((e) => ({
    id: e.id, date: e.date, title: e.title, description: e.summary, location: e.location,
    region: REGION_BY_ID[e.id], themes: DIPLOMACY.has(e.id) ? ['war', 'diplomacy'] as EventTheme[] : ['war'] as EventTheme[],
    source: e.source, origin: 'ww1' as const, compare: null, storyId: null, focus: pointFocus(e.location), entities: [],
  })))
}

function fromWw2(): HistoricalEvent[] {
  return WW2_MOMENTS.flatMap((m) => m.events.map((e) => ({
    id: e.id, date: e.date, title: e.title, description: e.explanation, location: e.location,
    region: REGION_BY_ID[e.id], themes: ['war'] as EventTheme[],
    source: { title: e.source.title, url: e.source.url }, origin: 'ww2' as const, compare: null, storyId: null,
    focus: pointFocus(e.location), entities: [],
  })))
}

/** Merges catalogs: an id or the same (date, English title) pair appears once; the first catalog wins. */
export function mergeEvents(...lists: HistoricalEvent[][]): HistoricalEvent[] {
  const ids = new Set<string>()
  const keys = new Set<string>()
  const merged: HistoricalEvent[] = []
  for (const event of lists.flat()) {
    const key = `${event.date}|${event.title.en.toLocaleLowerCase()}`
    if (ids.has(event.id) || keys.has(key)) continue
    ids.add(event.id)
    keys.add(key)
    merged.push(event)
  }
  return merged.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = mergeEvents(fromBorders(), fromWw1(), fromWw2(), CATALOG_EVENTS, ADDITIONAL_EVENTS)
const BY_ID = new Map(HISTORICAL_EVENTS.map((e) => [e.id, e]))
export const eventById = (id: string | null | undefined) => (id ? BY_ID.get(id) ?? null : null)

export interface EventFilter {
  regions: EventRegion[]
  themes: EventTheme[]
  from: number
  to: number
  query: string
}

export const EMPTY_FILTER: EventFilter = { regions: [], themes: [], from: FIRST_HISTORICAL_YEAR, to: LAST_HISTORICAL_YEAR, query: '' }

/** Chronological; empty region/theme lists mean "all"; the query matches title or description in both languages. */
export function filterEvents(events: HistoricalEvent[], filter: EventFilter): HistoricalEvent[] {
  const q = filter.query.trim().toLocaleLowerCase()
  return events.filter((e) => {
    const year = Number(e.date.slice(0, 4))
    if (year < filter.from || year > filter.to) return false
    if (filter.regions.length && !filter.regions.includes(e.region)) return false
    if (filter.themes.length && !e.themes.some((t) => filter.themes.includes(t))) return false
    if (!q) return true
    return [e.title.en, e.title.de, e.description.en, e.description.de].some((text) => text.toLocaleLowerCase().includes(q))
  })
}

/**
 * The 1 January snapshots around an event. `after` is the first map that can show the state after the
 * event (an event on 1 January is on that day's map); null when no such map exists (after 2019).
 */
export function snapshotYears(event: HistoricalEvent): { before: number | null; after: number | null } {
  if (event.compare) return event.compare
  const year = Number(event.date.slice(0, 4))
  const onJan1 = event.date.endsWith('-01-01')
  const before = onJan1 ? year - 1 : year
  const after = onJan1 ? year : year + 1
  const inRange = (y: number) => y >= FIRST_HISTORICAL_YEAR && y <= LAST_HISTORICAL_YEAR
  return { before: inRange(before) ? before : null, after: inRange(after) ? after : null }
}

/** The map year to open for an event: the first snapshot after it, else the nearest allowed one. */
export function mapYearForEvent(event: HistoricalEvent): number {
  const { before, after } = snapshotYears(event)
  return after ?? before ?? Math.min(LAST_HISTORICAL_YEAR, Math.max(FIRST_HISTORICAL_YEAR, Number(event.date.slice(0, 4))))
}

/** How the shown 1 January map relates to the event day. */
export function mapRelation(event: HistoricalEvent, year: number): { mapDate: string; relation: 'before' | 'same-day' | 'after'; days: number } {
  const mapDate = `${year}-01-01`
  const days = Math.round((Date.parse(`${mapDate}T00:00:00Z`) - Date.parse(`${event.date}T00:00:00Z`)) / 86400000)
  return { mapDate, relation: days < 0 ? 'before' : days === 0 ? 'same-day' : 'after', days: Math.abs(days) }
}

export interface EventTour {
  id: string
  /** pack: a regional history pack with an introduction; tour: a thematic tour. */
  kind: 'pack' | 'tour'
  title: Localized
  description: Localized
  eventIds: string[]
}

const tour = (id: string, title: Localized, description: Localized, pick: (e: HistoricalEvent) => boolean): EventTour =>
  ({ id, kind: 'tour', title, description, eventIds: HISTORICAL_EVENTS.filter(pick).map((e) => e.id) })
/** A curated sequence, listed explicitly and chronologically (checked by test) so it does not change when the catalog grows. */
const pack = (id: string, title: Localized, description: Localized, eventIds: string[]): EventTour =>
  ({ id, kind: 'pack', title, description, eventIds })

/** Curated tours, built only from catalog events. */
export const EVENT_TOURS: EventTour[] = [
  tour('europe-ww1', { en: 'Europe in the First World War', de: 'Europa im Ersten Weltkrieg' },
    { en: 'Events of the WWI learning view in Europe, 1914–1918.', de: 'Ereignisse der Ansicht zum Ersten Weltkrieg in Europa, 1914–1918.' },
    (e) => e.origin === 'ww1' && e.region === 'europe'),
  tour('europe-ww2', { en: 'Europe in the Second World War', de: 'Europa im Zweiten Weltkrieg' },
    { en: 'Events of the WWII learning view in Europe, 1939–1945.', de: 'Ereignisse der Ansicht zum Zweiten Weltkrieg in Europa, 1939–1945.' },
    (e) => e.origin === 'ww2' && e.region === 'europe'),
  tour('asia-pacific-ww2', { en: 'Asia and the Pacific, 1941–1951', de: 'Asien und Pazifik, 1941–1951' },
    { en: 'WWII events in Asia and the Pacific and the 1951 peace treaty with Japan.', de: 'Ereignisse des Zweiten Weltkriegs in Asien und im Pazifik und der Friedensvertrag mit Japan 1951.' },
    (e) => e.region === 'asia-pacific' && (e.origin === 'ww2' || e.id === 'san-francisco-treaty-1951')),
  tour('statehood', { en: 'States dissolve and emerge', de: 'Zerfall und Neugründung von Staaten' },
    { en: 'Independence, unification and dissolution events with sources, 1947–2011.', de: 'Belegte Unabhängigkeiten, Vereinigungen und Auflösungen, 1947–2011.' },
    (e) => ['india-pakistan-1947', 'ghana-1957', 'german-unity', 'soviet-union', 'czechoslovakia', 'south-sudan'].includes(e.id)),
  pack('africa-independence', { en: 'Africa Through Independence', de: 'Afrika auf dem Weg zur Unabhängigkeit' },
    {
      en: 'From Libya in 1951 to South Sudan in 2011: dated steps of decolonisation and new statehood. 10 of the 17 steps are dated by the United States’ recognition, not by an independence day, and are titled “United States recognizes …”; recognition and independence can fall on different days. The maps show 1 January borders, not the event day.',
      de: 'Von Libyen 1951 bis zum Südsudan 2011: datierte Schritte der Dekolonisierung und neuer Staatlichkeit. 10 der 17 Schritte sind nach der Anerkennung durch die Vereinigten Staaten datiert, nicht nach einem Unabhängigkeitstag, und heißen „Vereinigte Staaten erkennen … an“; Anerkennung und Unabhängigkeit können auf verschiedene Tage fallen. Die Karten zeigen Grenzen am 1. Januar, nicht am Ereignistag.',
    },
    ['libya-1951', 'sudan-1956', 'morocco-1956', 'tunisia-1956', 'ghana-1957', 'guinea-1958', 'congo-1960', 'nigeria-1960', 'south-africa-republic-1961', 'tanganyika-1961', 'algeria-1962', 'kenya-1963', 'mozambique-1975', 'angola-1975', 'zimbabwe-1980', 'namibia-1990', 'south-sudan']),
  pack('asia-transformation', { en: 'Asia in Transformation', de: 'Asien im Wandel' },
    {
      en: 'From the end of colonial rule after 1945 to Singapore in 1965: new states, a revolution and a peace treaty. 5 of the 8 steps are dated by the United States’ recognition, not by an independence day, and are titled “United States recognizes …”.',
      de: 'Vom Ende kolonialer Herrschaft nach 1945 bis Singapur 1965: neue Staaten, eine Revolution und ein Friedensvertrag. 5 der 8 Schritte sind nach der Anerkennung durch die Vereinigten Staaten datiert, nicht nach einem Unabhängigkeitstag, und heißen „Vereinigte Staaten erkennen … an“.',
    },
    ['philippines-1946', 'india-pakistan-1947', 'burma-1948', 'ceylon-1948', 'prc-1949', 'indonesia-1949', 'san-francisco-treaty-1951', 'singapore-1965']),
  pack('middle-east', { en: 'Middle East: A Changing Region', de: 'Naher Osten: eine Region im Wandel' },
    {
      en: 'From 1932 to 1993: state formation, wars and peace efforts. War, occupation and military control are shown as events, never as changes of state borders.',
      de: 'Von 1932 bis 1993: Staatsbildung, Kriege und Friedensbemühungen. Krieg, Besatzung und militärische Kontrolle erscheinen als Ereignisse, nie als Änderung von Staatsgrenzen.',
    },
    ['saudi-arabia-1932', 'jordan-1946', 'israel-1948', 'suez-1956', 'six-day-war-1967', 'camp-david-1978', 'kuwait-invasion-1990', 'oslo-1993']),
  pack('americas-turning-points', { en: 'Americas: Political Turning Points', de: 'Amerika: politische Wendepunkte' },
    {
      en: 'From 1898 to 1981: war, new states, the Cuban Missile Crisis, a coup and the Panama Canal treaties.',
      de: 'Von 1898 bis 1981: Krieg, neue Staaten, die Kubakrise, ein Putsch und die Panamakanal-Verträge.',
    },
    ['spanish-american-war-1898', 'panama-1903', 'jamaica-1962', 'trinidad-tobago-1962', 'cuban-missile-crisis-1962', 'chile-coup-1973', 'panama-canal-treaties-1977', 'belize-1981']),
]
export const tourById = (id: string | null | undefined) => EVENT_TOURS.find((t) => t.id === id) ?? null

/**
 * The World War learning moment an event belongs to. That view shows borders on the moment's exact
 * date (WWII) or 1 January (WWI), not on the event day; the link keeps that meaning.
 */
export function warMomentFor(event: HistoricalEvent): { view: 'ww1' | 'ww2'; year: number; date: string } | null {
  if (event.origin === 'ww1') {
    const m = WW1_MOMENTS.find((moment) => moment.events.some((e) => e.id === event.id))
    return m ? { view: 'ww1', year: m.year, date: m.date } : null
  }
  if (event.origin === 'ww2') {
    const m = WW2_MOMENTS.find((moment) => moment.events.some((e) => e.id === event.id))
    return m ? { view: 'ww2', year: m.year, date: m.date } : null
  }
  return null
}
