import type { Country } from '@/types'

/** Lower-cases and strips diacritics so "Cote d'Ivoire" matches "Côte d'Ivoire". */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export interface SearchEntry {
  country: Country
  name: string
  officialName: string
  capitals: string[]
  codes: string[]
}

export function buildIndex(countries: Country[]): SearchEntry[] {
  return countries.map((country) => ({
    country,
    name: fold(country.name),
    officialName: fold(country.officialName),
    capitals: country.capital.map(fold),
    codes: [fold(country.code), fold(country.code2)],
  }))
}

/** Lower is better; Infinity means no match. */
function score(e: SearchEntry, q: string): number {
  if (e.name === q) return 0
  if (e.name.startsWith(q)) return 1
  if (e.name.split(/[\s\-']/).some((w) => w.startsWith(q))) return 2
  if (e.codes.includes(q)) return 2.5
  if (e.name.includes(q)) return 3
  if (e.capitals.some((c) => c.startsWith(q)) || e.officialName.startsWith(q)) return 4
  if (e.capitals.some((c) => c.includes(q)) || e.officialName.includes(q)) return 5
  return Infinity
}

export function searchCountries(index: SearchEntry[], query: string, limit = 8): Country[] {
  const q = fold(query)
  if (!q) return []
  return index
    .map((e) => ({ e, s: score(e, q) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e.country)
}
