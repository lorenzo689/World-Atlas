import type { HistoricalSnapshot } from './history'

export interface HistoryEvent {
  id: string
  date: string
  before: number
  after: number
  title: { en: string; de: string }
  detail: { en: string; de: string }
  source: string
}

export const HISTORY_EVENTS: HistoryEvent[] = [
  { id: 'german-unity', date: '1990-10-03', before: 1989, after: 1991, title: { en: 'German reunification', de: 'Deutsche Wiedervereinigung' }, detail: { en: 'East and West Germany became one state.', de: 'Ost- und Westdeutschland wurden ein Staat.' }, source: 'https://www.bundesregierung.de/breg-de/schwerpunkte/deutsche-einheit/die-einheit-ist-wirklichkeit-432814' },
  { id: 'soviet-union', date: '1991-12-24', before: 1991, after: 1992, title: { en: 'Soviet Union succession', de: 'Nachfolge der Sowjetunion' }, detail: { en: 'Russia continued the Soviet Union’s UN membership.', de: 'Russland führte die UN-Mitgliedschaft der Sowjetunion fort.' }, source: 'https://ask.un.org/faq/378083' },
  { id: 'czechoslovakia', date: '1993-01-01', before: 1992, after: 1993, title: { en: 'Dissolution of Czechoslovakia', de: 'Auflösung der Tschechoslowakei' }, detail: { en: 'The Czech Republic and Slovakia became independent states.', de: 'Tschechien und die Slowakei wurden eigenständige Staaten.' }, source: 'https://www.un.org/en/about-us/member-states/czechoslovakia' },
  { id: 'south-sudan', date: '2011-07-09', before: 2011, after: 2012, title: { en: 'South Sudan independence', de: 'Unabhängigkeit des Südsudans' }, detail: { en: 'South Sudan declared independence from Sudan.', de: 'Der Südsudan erklärte seine Unabhängigkeit vom Sudan.' }, source: 'https://www.un.org/en/about-us/member-states/south-sudan' },
]

/** A changed period or a state entering/leaving the selected snapshots. This is not a claim that every border segment changed. */
export function changedEntities(before: HistoricalSnapshot, after: HistoricalSnapshot): Set<string> {
  const a = new Map(before.boundaries.features.map((f) => [f.properties.code, (f.properties as typeof f.properties & { period: number }).period]))
  const b = new Map(after.boundaries.features.map((f) => [f.properties.code, (f.properties as typeof f.properties & { period: number }).period]))
  return new Set([...new Set([...a.keys(), ...b.keys()])].filter((code) => a.get(code) !== b.get(code)))
}

export function readHistoryLink(search: string): { year: number | null; compare: number | null } {
  const params = new URLSearchParams(search)
  const valid = (value: string | null) => value && /^\d{4}$/.test(value) && Number(value) >= 1886 && Number(value) <= 2019 ? Number(value) : null
  return { year: valid(params.get('year')), compare: valid(params.get('compare')) }
}
