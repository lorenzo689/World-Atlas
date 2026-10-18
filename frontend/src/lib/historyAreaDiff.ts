import type { HistoricalSnapshot } from './history'
import type { PolygonPair } from './historyAreaMath'

export interface AreaMesh { positions: Float32Array; indices: Uint32Array }
export interface AreaDifference {
  lost: AreaMesh
  gained: AreaMesh
  changedStates: number
  failedStates: string[]
}

const cache = new Map<string, AreaDifference>()

function pairsFor(before: HistoricalSnapshot, after: HistoricalSnapshot): PolygonPair[] {
  const oldFeatures = new Map(before.boundaries.features.map((f) => [f.properties.code, f]))
  const pairs: PolygonPair[] = []
  for (const next of after.boundaries.features) {
    const prior = oldFeatures.get(next.properties.code)
    if (!prior || (prior.properties as { period?: number }).period === (next.properties as { period?: number }).period) continue
    const beforeGeometry = prior.geometry
    const afterGeometry = next.geometry
    if ((beforeGeometry.type !== 'Polygon' && beforeGeometry.type !== 'MultiPolygon') ||
        (afterGeometry.type !== 'Polygon' && afterGeometry.type !== 'MultiPolygon')) continue
    pairs.push({ code: next.properties.code, before: beforeGeometry.coordinates as PolygonPair['before'], after: afterGeometry.coordinates as PolygonPair['after'] })
  }
  return pairs
}

export function loadAreaDifference(before: HistoricalSnapshot, after: HistoricalSnapshot, signal: AbortSignal): Promise<AreaDifference> {
  const key = `${before.year}:${after.year}`
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    cache.set(key, existing)
    return Promise.resolve(existing)
  }
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./historyAreaDiff.worker.ts', import.meta.url), { type: 'module' })
    const abort = () => {
      worker.terminate()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    const finish = () => {
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<AreaDifference & { error?: string }>) => {
      finish()
      if (event.data.error) return reject(new Error(event.data.error))
      cache.set(key, event.data)
      if (cache.size > 4) cache.delete(cache.keys().next().value!)
      resolve(event.data)
    }
    worker.onerror = (event) => {
      finish()
      reject(new Error(event.message))
    }
    worker.postMessage(pairsFor(before, after))
  })
}
