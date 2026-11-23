import type { GeometryCollection, Topology } from 'topojson-specification'
import { FIRST_HISTORICAL_YEAR, LAST_HISTORICAL_YEAR, historicalName } from './history'

/**
 * Per-identifier overview of the historical dataset ("Historical Country Explorer").
 *
 * Built once from the topology's period properties: no geometry is decoded and no snapshot is
 * created. A period is one record of the dataset (CShapes 2.0, plus the 1939–1945 OHM correction
 * for Germany and the Free City of Danzig). A new period is NOT evidence of a regime change or of a
 * real border shift: the source starts a new record when its coding changes, and the WWII
 * correction splits periods at its sample days.
 */
export interface EntityPeriod {
  period: number
  /** Inclusive source dates as YYYYMMDD. */
  start: number
  end: number
  sourceName: string
  capital: string | null
  /** Hash of the period's topology arcs: equal hashes mean identical dataset geometry. */
  shape: string
  /** First and last year whose 1 January map shows this period; null if no 1 January falls inside. */
  firstYear: number | null
  lastYear: number | null
}

export type EntityIndex = Map<string, EntityPeriod[]>

interface PeriodProps { code: string; name: string; start: number; end: number; capital: string | null; period: number }
type ArcTree = number | ArcTree[]

function hashArcs(arcs: ArcTree | undefined): string {
  let hash = 0x811c9dc5
  let count = 0
  const visit = (node: ArcTree | undefined) => {
    if (node == null) return
    if (typeof node === 'number') {
      hash = Math.imul(hash ^ (node + 0x9e3779b9), 0x01000193) >>> 0
      count++
      return
    }
    hash = Math.imul(hash ^ 0x2f, 0x01000193) >>> 0 // ring/polygon separator
    for (const child of node) visit(child)
  }
  visit(arcs)
  return `${count}:${hash.toString(36)}`
}

function snapshotYears(start: number, end: number): [number | null, number | null] {
  const startYear = Math.floor(start / 10000)
  const first = Math.max(FIRST_HISTORICAL_YEAR, start % 10000 === 101 ? startYear : startYear + 1)
  const last = Math.min(LAST_HISTORICAL_YEAR, Math.floor(end / 10000))
  return first <= last ? [first, last] : [null, null]
}

export function buildEntityIndex(topology: Topology): EntityIndex {
  const index: EntityIndex = new Map()
  const geometries = (topology.objects.periods as GeometryCollection<PeriodProps>).geometries
  for (const geometry of geometries) {
    const p = geometry.properties as PeriodProps
    const [firstYear, lastYear] = snapshotYears(p.start, p.end)
    const list = index.get(p.code) ?? []
    list.push({
      period: p.period, start: p.start, end: p.end, sourceName: p.name, capital: p.capital ?? null,
      shape: hashArcs((geometry as { arcs?: ArcTree }).arcs), firstYear, lastYear,
    })
    index.set(p.code, list)
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start)
  return index
}

export const dayToIso = (day: number) => `${Math.floor(day / 10000)}-${String(Math.floor(day / 100) % 100).padStart(2, '0')}-${String(day % 100).padStart(2, '0')}`
const nextDay = (day: number) => {
  const d = new Date(Date.UTC(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100 + 1))
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}

/** The period shown on the 1 January map of `year`, or null when the identifier is not in that snapshot. */
export function periodAt(periods: EntityPeriod[], year: number): EntityPeriod | null {
  const day = year * 10000 + 101
  return periods.find((p) => p.start <= day && day <= p.end) ?? null
}

/** Contiguous runs of 1 January snapshots that contain the identifier. */
export function presenceRanges(periods: EntityPeriod[]): [number, number][] {
  const ranges: [number, number][] = []
  for (const p of periods) {
    if (p.firstYear == null || p.lastYear == null) continue
    const last = ranges.at(-1)
    if (last && p.firstYear <= last[1] + 1) last[1] = Math.max(last[1], p.lastYear)
    else ranges.push([p.firstYear, p.lastYear])
  }
  return ranges
}

/** Nearest earlier and later snapshot years that contain the identifier (for an absent year). */
export function nearestPresence(periods: EntityPeriod[], year: number): { before: number | null; after: number | null } {
  let before: number | null = null
  let after: number | null = null
  for (const [from, to] of presenceRanges(periods)) {
    if (to < year) before = to
    else if (from > year && after == null) after = from
  }
  return { before, after }
}

export interface NameSegment { label: string; from: number; to: number }

/** Labels the atlas shows per 1 January snapshot (the CShapes label, clarified for a few identifiers). */
export function nameSegments(code: string, periods: EntityPeriod[]): NameSegment[] {
  const segments: NameSegment[] = []
  for (const p of periods) {
    if (p.firstYear == null || p.lastYear == null) continue
    for (let year = p.firstYear; year <= p.lastYear; year++) {
      const label = historicalName(code, p.sourceName, year)
      const last = segments.at(-1)
      if (last && last.label === label && last.to === year - 1) last.to = year
      else segments.push({ label, from: year, to: year })
    }
  }
  return segments
}

export function labelAt(code: string, periods: EntityPeriod[], year: number): string | null {
  const p = periodAt(periods, year)
  return p ? historicalName(code, p.sourceName, year) : null
}

/** Label of the nearest snapshot that contains the identifier; used to name an absent selection. */
export function nearestLabel(code: string, periods: EntityPeriod[], year: number): string {
  const here = labelAt(code, periods, year)
  if (here) return here
  const { before, after } = nearestPresence(periods, year)
  const ref = before ?? after
  return (ref != null ? labelAt(code, periods, ref) : null) ?? periods[0]?.sourceName ?? code
}

export interface PeriodChange {
  /** The dataset has no record between the previous period's end and this start. */
  gapBefore: boolean
  capitalChanged: boolean
  sourceNameChanged: boolean
  /** null for the first period. */
  geometryChanged: boolean | null
  /** Inside 1939–1945, where the WWII annexation correction may split periods at sample days. */
  wartimeSplit: boolean
}

export function changeFromPrevious(previous: EntityPeriod | undefined, current: EntityPeriod): PeriodChange {
  const wartime = current.start >= 19390101 && current.start <= 19451231
  if (!previous) return { gapBefore: false, capitalChanged: false, sourceNameChanged: false, geometryChanged: null, wartimeSplit: false }
  return {
    gapBefore: nextDay(previous.end) !== current.start,
    capitalChanged: previous.capital !== current.capital,
    sourceNameChanged: previous.sourceName !== current.sourceName,
    geometryChanged: previous.shape !== current.shape,
    wartimeSplit: wartime,
  }
}

/** First 1 January map of the adjacent reachable periods, relative to the shown year. */
export function adjacentPeriodYears(periods: EntityPeriod[], year: number): { previous: number | null; next: number | null } {
  const day = year * 10000 + 101
  const reachable = periods.filter((p) => p.firstYear != null)
  const current = periodAt(periods, year)
  const before = reachable.filter((p) => current ? p.start < current.start : p.end < day)
  const after = reachable.filter((p) => current ? p.start > current.start : p.start > day)
  return { previous: before.at(-1)?.firstYear ?? null, next: after[0]?.firstYear ?? null }
}

export interface EntitySide {
  year: number
  /** 1 January map date. */
  date: string
  period: EntityPeriod | null
  label: string | null
}

export interface EntityComparison {
  a: EntitySide
  b: EntitySide
  /** Both snapshots contain the identifier. A shared identifier is a dataset convention, not evidence of state continuity. */
  sharedIdentifier: boolean
  samePeriod: boolean
  /** null when one side is missing: the geometry cannot be compared. */
  geometryIdentical: boolean | null
}

export function compareEntity(code: string, periods: EntityPeriod[], yearA: number, yearB: number): EntityComparison {
  const side = (year: number): EntitySide => {
    const period = periodAt(periods, year)
    return { year, date: `${year}-01-01`, period, label: period ? historicalName(code, period.sourceName, year) : null }
  }
  const a = side(yearA)
  const b = side(yearB)
  const both = !!a.period && !!b.period
  return {
    a, b,
    sharedIdentifier: both,
    samePeriod: both && a.period!.period === b.period!.period,
    geometryIdentical: both ? a.period!.shape === b.period!.shape : null,
  }
}

/**
 * Curated events (HISTORY_EVENTS) and the dataset identifiers their own description names. This is
 * a lookup for display, not a classification: the event text and its primary source remain the claim.
 */
export const EVENT_ENTITIES: Record<string, string[]> = {
  'german-unity': ['H260', 'H265'],
  'soviet-union': ['H365'],
  czechoslovakia: ['H315', 'H316', 'H317'],
  'south-sudan': ['H625', 'H626'],
}

export function eventsForEntity(code: string): string[] {
  return Object.entries(EVENT_ENTITIES).filter(([, codes]) => codes.includes(code)).map(([id]) => id)
}

/** Source of the dataset geometry for a period: OHM for the corrected 1939–1945 Germany and for Danzig. */
export function periodSource(code: string, period: EntityPeriod): 'cshapes' | 'ohm' {
  if (code === 'HDANZIG') return 'ohm'
  if (code === 'H255' && period.start >= 19390101 && period.start <= 19451231) return 'ohm'
  return 'cshapes'
}
