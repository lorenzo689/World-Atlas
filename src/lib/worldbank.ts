import type { DataPoint, IndicatorSeries } from '@/types'

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

export function fetchSeries(countryCode: string, indicatorId: string): Promise<IndicatorSeries> {
  const key = `${countryCode}:${indicatorId}`
  let p = seriesCache.get(key)
  if (!p) {
    p = getJson(`${API}/country/${countryCode}/indicator/${indicatorId}?format=json&per_page=100`).then((j) =>
      parseSeries(j, indicatorId),
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
    p = getJson(`${API}/country/all/indicator/${indicatorId}?format=json&mrnev=1&per_page=400`).then(parseLatestAll)
    p.catch(() => latestCache.delete(indicatorId))
    latestCache.set(indicatorId, p)
  }
  return p
}
