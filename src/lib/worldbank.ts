import type { DataPoint, IndicatorSeries } from '@/types'
import { backendAvailable } from '@/lib/api'
import { INDICATORS } from '@/lib/indicators'

const API = 'https://api.worldbank.org/v2'

interface WbRow {
  indicator?: { id: string; value: string }
  countryiso3code?: string
  date: string
  value: number | null
}

interface WbMeta {
  lastupdated?: string
  message?: { id: string; value: string }[]
}

function unwrap(json: unknown): { meta: WbMeta; rows: WbRow[] } {
  if (!Array.isArray(json) || json.length === 0) throw new Error('Unexpected World Bank response')
  const meta = (json[0] ?? {}) as WbMeta
  if (Array.isArray(meta.message) && meta.message.length) {
    throw new Error(meta.message[0]?.value ?? 'World Bank API error')
  }
  return { meta, rows: ((json[1] as WbRow[] | null | undefined) ?? []) }
}

/** Turns a raw World Bank response into a clean, ascending series without null observations. */
export function parseSeries(json: unknown, indicatorId: string): IndicatorSeries {
  const { meta, rows } = unwrap(json)
  const points: DataPoint[] = rows
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .map((r) => ({ year: Number(r.date), value: r.value as number }))
    .filter((p) => Number.isFinite(p.year))
    .sort((a, b) => a.year - b.year)
  return {
    indicatorId,
    label: rows[0]?.indicator?.value ?? indicatorId,
    points,
    latest: points.at(-1) ?? null,
    lastUpdated: meta.lastupdated ?? null,
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`World Bank request failed (${res.status})`)
  return res.json()
}

const seriesCache = new Map<string, Promise<IndicatorSeries>>()

/** Indicator key (backend) for a World Bank id, if the data platform ingests it. */
const keyFor = (indicatorId: string) => Object.values(INDICATORS).find((m) => m.id === indicatorId)?.key

/**
 * Data comes from our own data platform when the backend runs (one fast query on PostgreSQL),
 * and straight from the World Bank API otherwise. Both paths return the same shape.
 */
async function fromBackend<T>(path: string, map: (json: unknown) => T): Promise<T | null> {
  if (!(await backendAvailable())) return null
  try {
    const res = await fetch(`/api${path}`)
    if (!res.ok) return null
    return map(await res.json())
  } catch {
    return null
  }
}

export function fetchSeries(countryCode: string, indicatorId: string): Promise<IndicatorSeries> {
  const key = `${countryCode}:${indicatorId}`
  let p = seriesCache.get(key)
  if (!p) {
    const indicatorKey = keyFor(indicatorId)
    p = (indicatorKey
      ? fromBackend(`/indicators/${indicatorKey}/series?countries=${countryCode}`, (json) => {
          const points = ((json as { series: { points: DataPoint[] }[] }).series[0]?.points ?? []) as DataPoint[]
          if (!points.length) return null // not ingested yet: ask the World Bank
          return {
            indicatorId,
            label: INDICATORS[indicatorKey].label,
            points,
            latest: points.at(-1) ?? null,
            lastUpdated: null,
          } satisfies IndicatorSeries
        })
      : Promise.resolve(null)
    ).then(
      (fromPlatform) =>
        fromPlatform ??
        getJson(`${API}/country/${countryCode}/indicator/${indicatorId}?format=json&per_page=100`).then((j) =>
          parseSeries(j, indicatorId),
        ),
    )
    // Failures are not cached so a retry actually refetches.
    p.catch(() => seriesCache.delete(key))
    seriesCache.set(key, p)
  }
  return p
}

export interface LatestValue {
  year: number
  value: number
}

export function parseLatestAll(json: unknown): Map<string, LatestValue> {
  const { rows } = unwrap(json)
  const out = new Map<string, LatestValue>()
  for (const r of rows) {
    if (r.value == null || !r.countryiso3code || r.countryiso3code.length !== 3) continue
    out.set(r.countryiso3code, { year: Number(r.date), value: r.value })
  }
  return out
}

const latestCache = new Map<string, Promise<Map<string, LatestValue>>>()

/** Most recent non-empty value for every country in a single request. */
export function fetchLatestForAll(indicatorId: string): Promise<Map<string, LatestValue>> {
  let p = latestCache.get(indicatorId)
  if (!p) {
    const indicatorKey = keyFor(indicatorId)
    p = (indicatorKey
      ? fromBackend(`/indicators/${indicatorKey}/latest`, (json) => {
          const values = (json as { values: Record<string, LatestValue> }).values
          return Object.keys(values).length ? new Map(Object.entries(values)) : null
        })
      : Promise.resolve(null)
    ).then(
      (fromPlatform) =>
        fromPlatform ??
        getJson(`${API}/country/all/indicator/${indicatorId}?format=json&mrnev=1&per_page=400`).then(parseLatestAll),
    )
    p.catch(() => latestCache.delete(indicatorId))
    latestCache.set(indicatorId, p)
  }
  return p
}
