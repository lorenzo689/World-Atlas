import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Boundaries, CountryProps } from '@/lib/geo'
import type { PrecomputedGeometry } from '@/lib/globeLayers'

export const FIRST_HISTORICAL_YEAR = 1886
export const LAST_HISTORICAL_YEAR = 2019

interface PeriodProps extends CountryProps {
  period: number
  start: number
  end: number
  capital: string | null
  lat: number | null
  lng: number | null
  iso: string | null
}

interface FlagPeriod {
  file: string
  start: string | null
  end: string | null
}

interface MasterGeometry {
  lnglat: Float32Array
  indices: Uint32Array
  ranges: [number, number, number, number, number][]
}

type PeriodGeometry = GeometryCollection<PeriodProps>['geometries'][number] & { properties: PeriodProps }

export interface HistoryData {
  topology: Topology
  geometry: MasterGeometry
  flags: Record<string, FlagPeriod[]>
}

export interface HistoricalEntity {
  code: string
  name: string
  capital: string | null
  iso: string | null
  flagFile: string | null
}

export interface HistoricalSnapshot {
  year: number
  boundaries: Boundaries
  entities: Map<string, HistoricalEntity>
}

const base = import.meta.env.BASE_URL
let loadPromise: Promise<HistoryData> | null = null

export function loadHistory(): Promise<HistoryData> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      fetch(`${base}data/historical-topology.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error('Historical boundaries unavailable'))),
      fetch(`${base}data/historical-geometry.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error('Historical geometry metadata unavailable'))),
      fetch(`${base}data/historical-geometry.bin`).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error('Historical geometry unavailable'))),
      fetch(`${base}data/historical-flags.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error('Historical flags unavailable'))),
    ]).then(([topology, meta, bin, flags]) => ({
      topology: topology as Topology,
      geometry: {
        lnglat: new Float32Array(bin, 0, meta.vertices * 2),
        indices: decodeIndices(bin, meta),
        ranges: meta.ranges,
      } as MasterGeometry,
      flags: flags as Record<string, FlagPeriod[]>,
    }))
    loadPromise.catch(() => { loadPromise = null })
  }
  return loadPromise
}

function decodeIndices(bin: ArrayBuffer, meta: { vertices: number; indices: number; ranges: [number, number, number, number, number][]; indexEncoding?: string }): Uint32Array {
  const offset = meta.vertices * 2 * 4
  if (!meta.indexEncoding) return new Uint32Array(bin, offset, meta.indices)
  const local = meta.indexEncoding === 'local-u16'
    ? new Uint16Array(bin, offset, meta.indices)
    : new Uint32Array(bin, offset, meta.indices)
  const global = new Uint32Array(local.length)
  for (const [, vStart, , iStart, iCount] of meta.ranges) {
    for (let i = iStart; i < iStart + iCount; i++) global[i] = local[i] + vStart
  }
  return global
}

/** CShapes observations are selected at 1 January of each year. */
export function flagAtYear(periods: FlagPeriod[] | undefined, year: number): string | null {
  const day = `${year}-01-01`
  const valid = periods?.filter((p) => p.start && p.start <= day && (!p.end || day < p.end)) ?? []
  // Prefer the most recent start when source intervals overlap. Undated flags are intentionally
  // omitted: a current flag must not be shown for an earlier colonial or historical state.
  valid.sort((a, b) => b.start!.localeCompare(a.start!))
  return valid[0]?.file ?? null
}

export function commonsFlagUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=160`
}

export function snapshotForYear(data: HistoryData, year: number): HistoricalSnapshot {
  if (!Number.isInteger(year) || year < FIRST_HISTORICAL_YEAR || year > LAST_HISTORICAL_YEAR) {
    throw new RangeError(`Historical year ${year} is outside ${FIRST_HISTORICAL_YEAR}–${LAST_HISTORICAL_YEAR}`)
  }
  const day = year * 10000 + 101
  const periods = ((data.topology.objects.periods as GeometryCollection<PeriodProps>).geometries as PeriodGeometry[])
    .filter((g) => g.properties.start <= day && day <= g.properties.end)
  const collection: GeometryCollection<PeriodProps> = { type: 'GeometryCollection', geometries: periods }
  const decoded = feature(data.topology, collection) as FeatureCollection<Geometry, PeriodProps>
  const borders = mesh(data.topology, collection).coordinates

  const sourceRanges = new Map(data.geometry.ranges.map((r) => [r[0], r]))
  const vertexCount = periods.reduce((n, p) => n + (sourceRanges.get(p.properties.period)?.[2] ?? 0), 0)
  const indexCount = periods.reduce((n, p) => n + (sourceRanges.get(p.properties.period)?.[4] ?? 0), 0)
  const lnglat = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(indexCount)
  const ranges: PrecomputedGeometry['ranges'] = []
  let vertexOffset = 0
  let indexOffset = 0
  for (const p of periods) {
    const range = sourceRanges.get(p.properties.period)
    if (!range) continue
    const [, vStart, vCount, iStart, iCount] = range
    lnglat.set(data.geometry.lnglat.subarray(vStart * 2, (vStart + vCount) * 2), vertexOffset * 2)
    for (let i = 0; i < iCount; i++) indices[indexOffset + i] = data.geometry.indices[iStart + i] - vStart + vertexOffset
    ranges.push([p.properties.code, vertexOffset, vCount, indexOffset, iCount])
    vertexOffset += vCount
    indexOffset += iCount
  }
  const entities = new Map<string, HistoricalEntity>()
  for (const p of periods) {
    const props = p.properties
    entities.set(props.code, {
      code: props.code,
      name: historicalName(props.code, props.name, year),
      capital: props.capital,
      iso: props.iso,
      flagFile: flagAtYear(data.flags[props.code.slice(1)], year),
    })
  }
  return {
    year,
    boundaries: { ...decoded, borders, geometry: { lnglat, indices, ranges } } as Boundaries,
    entities,
  }
}

/** CShapes keeps one label across successive political regimes; clarify a few prominent cases. */
export function historicalName(code: string, sourceName: string, year: number): string {
  if (code === 'H365') return year < 1918 ? 'Russian Empire' : year < 1922 ? 'Russian SFSR' : year < 1992 ? 'Soviet Union' : 'Russia'
  if (code === 'H255') return year < 1919 ? 'German Empire' : year < 1933 ? 'Weimar Republic' : 'Germany'
  if (code === 'H260') return year < 1949 ? 'Western occupation zones' : year < 1991 ? 'West Germany' : 'Germany'
  if (code === 'H265') return year < 1949 ? 'Soviet occupation zone' : 'East Germany'
  return sourceName
}
