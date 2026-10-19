import type { HistoricalEntity } from './history'
import { fetchSeries } from './worldbank'

export interface HistoricalContext {
  year: number
  iso: string
  population: number | null
  refugees: number | null
}

// A shared ISO code is not enough where the state/territory changed. Earlier series may
// describe a successor state or a different statistical geography.
const EARLIEST_COMPARABLE: Record<string, number> = {
  DEU: 1992, RUS: 1992, UKR: 1992, BLR: 1992, KAZ: 1992,
  CZE: 1993, SVK: 1993, HRV: 1993, SVN: 1993, BIH: 1993, MKD: 1993,
  ERI: 1994, TLS: 2003, MNE: 2007, SRB: 2007, SSD: 2012, SDN: 2012,
}

export function comparableIso(entity: HistoricalEntity, year: number): string | null {
  const iso = entity.iso
  if (!iso || !/^[A-Z]{3}$/.test(iso) || year < 1992 || year > 2019) return null
  if (year < (EARLIEST_COMPARABLE[iso] ?? 1992)) return null
  if (/empire|soviet|yugoslav|occupation|west germany|east germany|czechoslovak/i.test(entity.name)) return null
  return iso
}

interface UnhcrItem { year?: number; coo_iso?: string; refugees?: number | string }

export function parseRefugees(json: unknown, iso: string, year: number): number | null {
  const items = (json as { items?: UnhcrItem[] } | null)?.items
  if (!Array.isArray(items)) return null
  const matching = items.find((item) => item.year === year && item.coo_iso === iso)
  if (!matching) return null
  const value = Number(matching.refugees)
  return Number.isFinite(value) && value >= 0 ? value : null
}

const cache = new Map<string, Promise<HistoricalContext>>()

/** Exact-year values only. An absent observation stays absent; no interpolation. */
export function fetchHistoricalContext(iso: string, year: number): Promise<HistoricalContext> {
  const key = `${iso}:${year}`
  let pending = cache.get(key)
  if (!pending) {
    pending = Promise.allSettled([
      fetchSeries(iso, 'SP.POP.TOTL'),
      fetch(`https://api.unhcr.org/population/v1/population/?year=${year}&coo=${iso}&cf_type=ISO&limit=1`)
        .then((response) => {
          if (!response.ok) throw new Error(`UNHCR request failed (${response.status})`)
          return response.json()
        }),
    ]).then(([population, refugees]) => ({
      iso,
      year,
      population: population.status === 'fulfilled'
        ? population.value.points.find((point) => point.year === year)?.value ?? null : null,
      refugees: refugees.status === 'fulfilled' ? parseRefugees(refugees.value, iso, year) : null,
    }))
    pending.catch(() => cache.delete(key))
    if (cache.size >= 64) cache.delete(cache.keys().next().value!)
    cache.set(key, pending)
  }
  return pending
}
