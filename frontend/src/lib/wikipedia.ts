export interface WikiSummary {
  title: string
  extract: string
  url: string
  description: string | null
}

const cache = new Map<string, Promise<WikiSummary | null>>()

export function safeWikipediaUrl(candidate: string | undefined, title: string): string {
  const fallback = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  if (!candidate) return fallback
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && (url.hostname === 'wikipedia.org' || url.hostname.endsWith('.wikipedia.org'))
      ? url.href : fallback
  } catch {
    return fallback
  }
}

async function trySummary(title: string): Promise<WikiSummary | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`)
  const j = await res.json()
  if (j.type !== 'standard' || !j.extract) return null
  return {
    title: j.title,
    extract: j.extract,
    url: safeWikipediaUrl(j.content_urls?.desktop?.page, title),
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
