export interface WikiSummary {
  title: string
  extract: string
  url: string
  description: string | null
}

const cache = new Map<string, Promise<WikiSummary | null>>()

async function trySummary(title: string): Promise<WikiSummary | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`)
  const j = await res.json()
  if (j.type !== 'standard' || !j.extract) return null
  return {
    title: j.title,
    extract: j.extract,
    url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    description: j.description ?? null,
  }
}

/** Short encyclopedic summary. Tries "<name> (country)" first to dodge disambiguation pages. */
export function fetchCountrySummary(name: string, officialName?: string): Promise<WikiSummary | null> {
  let p = cache.get(name)
  if (!p) {
    p = (async () => {
      for (const t of [`${name} (country)`, name, officialName]) {
        if (!t) continue
        const s = await trySummary(t)
        if (s) return s
      }
      return null
    })()
    p.catch(() => cache.delete(name))
    cache.set(name, p)
  }
  return p
}
