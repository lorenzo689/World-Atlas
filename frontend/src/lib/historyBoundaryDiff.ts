import type { HistoricalSnapshot } from './history'

export type BorderSegment = [[number, number], [number, number]]

export interface BoundaryDifference {
  removed: BorderSegment[]
  added: BorderSegment[]
  removedKm: number
  addedKm: number
}

const pointKey = ([lng, lat]: number[]) => `${lng.toFixed(5)},${lat.toFixed(5)}`

function segments(snapshot: HistoricalSnapshot): Map<string, BorderSegment> {
  const out = new Map<string, BorderSegment>()
  for (const line of snapshot.boundaries.borders ?? []) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const ka = pointKey(a)
      const kb = pointKey(b)
      if (ka === kb) continue
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      if (!out.has(key)) out.set(key, [[a[0], a[1]], [b[0], b[1]]])
    }
  }
  return out
}

function lengthKm([[lng1, lat1], [lng2, lat2]]: BorderSegment): number {
  const rad = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2
  return 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Compare actual source geometry. Identical segments are excluded regardless of line direction. */
export function differenceBetweenBorders(before: HistoricalSnapshot, after: HistoricalSnapshot): BoundaryDifference {
  const oldSegments = segments(before)
  const newSegments = segments(after)
  const removed = [...oldSegments].filter(([key]) => !newSegments.has(key)).map(([, line]) => line)
  const added = [...newSegments].filter(([key]) => !oldSegments.has(key)).map(([, line]) => line)
  return {
    removed,
    added,
    removedKm: Math.round(removed.reduce((total, line) => total + lengthKm(line), 0)),
    addedKm: Math.round(added.reduce((total, line) => total + lengthKm(line), 0)),
  }
}
