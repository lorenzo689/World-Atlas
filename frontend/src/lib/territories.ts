import type { MultiPolygon, Polygon } from 'geojson'
import type { ScenarioId } from './scenarios'
import type { AreaMesh } from './historyAreaDiff'

export type Localized = { de: string; en: string }
export interface Territory {
  id: string
  actorId: string
  actor: Localized
  title: Localized
  color: string
  kind: 'occupation' | 'control' | 'contested'
  precision: 'schematic' | 'settlement-estimate'
  source: { title: string; url: string; date: string; license: string; licenseUrl?: string }
  geometry: Polygon | MultiPolygon
}
export interface TerritorySnapshot {
  id: string
  scenario: 'today' | 'ww1' | 'ww2'
  year: number
  date: string
  coverage: Localized
  features: Territory[]
}
export interface TerritoryDataset { schemaVersion: 1; snapshots: TerritorySnapshot[] }
export interface TerritoryArea { id: string; color: string; mesh: AreaMesh }

/** Point-in-polygon on click only; ignores holes and unknown/hidden actors correctly. */
export function pickTerritory(features: Territory[], visibleIds: ReadonlySet<string>, lng: number, lat: number): Territory | null {
  const contains = (ring: number[][]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j]
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  for (const feature of features) {
    if (!visibleIds.has(feature.id)) continue
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    if (polygons.some(([outer, ...holes]) => contains(outer) && !holes.some(contains))) return feature
  }
  return null
}

const datasets = new Map<string, Promise<TerritoryDataset>>()
const prepared = new Map<string, TerritoryArea[]>()
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
const localized = (text: Localized) => text && typeof text.de === 'string' && typeof text.en === 'string' && text.de.length > 0 && text.en.length > 0

/** Reject corrupt provenance/geometry instead of displaying an unattributed control claim. */
export function validateTerritories(data: TerritoryDataset): void {
  if (data.schemaVersion !== 1 || !Array.isArray(data.snapshots)) throw new Error('Unsupported territory dataset')
  const ids = new Set<string>()
  for (const snapshot of data.snapshots) {
    if (ids.has(snapshot.id) || !['today', 'ww1', 'ww2'].includes(snapshot.scenario) || !validDate(snapshot.date) || snapshot.year !== Number(snapshot.date.slice(0, 4)) || !localized(snapshot.coverage)) throw new Error('Invalid territory snapshot')
    ids.add(snapshot.id)
    const featureIds = new Set<string>()
    for (const feature of snapshot.features) {
      if (featureIds.has(feature.id) || !feature.actorId || !localized(feature.actor) || !localized(feature.title) || !/^#[0-9a-f]{6}$/i.test(feature.color) || !['occupation', 'control', 'contested'].includes(feature.kind) || !['schematic', 'settlement-estimate'].includes(feature.precision) || !validDate(feature.source.date) || feature.source.date !== snapshot.date || new URL(feature.source.url).protocol !== 'https:' || !feature.source.license) throw new Error('Invalid territory attribution')
      featureIds.add(feature.id)
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error('Invalid territory geometry')
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
      for (const polygon of polygons) for (const ring of polygon) {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) throw new Error('Unclosed territory ring')
        for (const [lng, lat] of ring) if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new Error('Invalid territory coordinates')
      }
    }
  }
}

export function territorySnapshot(data: TerritoryDataset, scenario: ScenarioId, year: number | null): TerritorySnapshot | null {
  // Never carry a front or occupation forward into an unsupported year.
  return data.snapshots.find((snapshot) => scenario === 'today' ? snapshot.scenario === 'today' : (scenario === 'borders' || scenario === snapshot.scenario) && snapshot.year === year) ?? null
}

export function loadTerritories(scenario: ScenarioId): Promise<TerritoryDataset> {
  const path = scenario === 'today' ? 'territories-today.json' : 'territories-history.json'
  let promise = datasets.get(path)
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}data/${path}`).then(async (response) => {
      if (!response.ok) throw new Error('Territory data unavailable')
      const data = await response.json() as TerritoryDataset
      validateTerritories(data)
      return data
    })
    datasets.set(path, promise)
    promise.catch(() => datasets.delete(path))
  }
  return promise
}

/** Geometry runs off the UI thread; abort terminates work and the cache holds at most four snapshots. */
export function prepareTerritories(snapshot: TerritorySnapshot, signal: AbortSignal): Promise<TerritoryArea[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const hit = prepared.get(snapshot.id)
  if (hit) { prepared.delete(snapshot.id); prepared.set(snapshot.id, hit); return Promise.resolve(hit) }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./territories.worker.ts', import.meta.url), { type: 'module' })
    const abort = () => { worker.terminate(); reject(new DOMException('Aborted', 'AbortError')) }
    const finish = () => { signal.removeEventListener('abort', abort); worker.terminate() }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ areas?: TerritoryArea[]; error?: string }>) => {
      finish()
      if (!event.data.areas || event.data.error) return reject(new Error(event.data.error ?? 'No area geometry'))
      prepared.set(snapshot.id, event.data.areas)
      if (prepared.size > 4) prepared.delete(prepared.keys().next().value!)
      resolve(event.data.areas)
    }
    worker.onerror = (event) => { finish(); reject(new Error(event.message)) }
    worker.postMessage(snapshot.features)
  })
}
