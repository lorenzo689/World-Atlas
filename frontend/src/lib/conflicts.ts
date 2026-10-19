import dataset from '../../public/data/conflicts.json'

type Localized = { de: string; en: string }

export interface ConflictBrief {
  id: string
  countryCodes: string[]
  title: Localized
  region: Localized
  status: 'active' | 'fragile-ceasefire'
  location: { lat: number; lng: number }
  locationPrecision: 'regional'
  sourceDate: string
  sourceName: string
  sourceUrl: string
  reviewedAt: string
  revision: number
  summary: Localized
  context: Localized
  question: Localized
  answer: Localized
}

/** Last reviewed static snapshot for GitHub Pages and backend outages. */
export const CONFLICT_BRIEFS = dataset.briefs as ConflictBrief[]

export function sourceAgeDays(sourceDate: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(`${sourceDate}T00:00:00Z`).getTime()) / 86_400_000))
}

export function validateConflictBriefs(briefs: ConflictBrief[], now = new Date()): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const brief of briefs) {
    if (ids.has(brief.id)) errors.push(`Duplicate id: ${brief.id}`)
    ids.add(brief.id)
    if (!Number.isFinite(Date.parse(`${brief.sourceDate}T00:00:00Z`)) || new Date(`${brief.sourceDate}T00:00:00Z`) > now) errors.push(`Invalid source date: ${brief.id}`)
    try { if (new URL(brief.sourceUrl).protocol !== 'https:') errors.push(`Invalid source URL: ${brief.id}`) }
    catch { errors.push(`Invalid source URL: ${brief.id}`) }
    if (Math.abs(brief.location.lat) > 90 || Math.abs(brief.location.lng) > 180) errors.push(`Invalid coordinates: ${brief.id}`)
    if (brief.locationPrecision !== 'regional' || brief.revision < 1) errors.push(`Invalid revision metadata: ${brief.id}`)
    if (sourceAgeDays(brief.sourceDate, now) > 90) errors.push(`Review outdated source: ${brief.id}`)
  }
  return errors
}
