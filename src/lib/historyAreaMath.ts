import { difference, type MultiPolygon, type Polygon } from 'polygon-clipping'

export type PolygonPair = { code: string; before: Polygon | MultiPolygon; after: Polygon | MultiPolygon }

export interface AreaDifferencePolygons {
  lost: MultiPolygon
  gained: MultiPolygon
  changedStates: number
  failedStates: string[]
}

/** Difference of surviving state footprints, preserving holes and separate islands. */
export function differenceBetweenAreas(pairs: PolygonPair[]): AreaDifferencePolygons {
  const lost: MultiPolygon = []
  const gained: MultiPolygon = []
  const failedStates: string[] = []
  let changedStates = 0
  for (const { code, before, after } of pairs) {
    try {
      const oldOnly = difference(before, after)
      const newOnly = difference(after, before)
      if (oldOnly.length || newOnly.length) changedStates++
      lost.push(...oldOnly)
      gained.push(...newOnly)
    } catch {
      // Keep a visible diagnostic instead of showing a potentially false area for invalid geometry.
      failedStates.push(code)
    }
  }
  return { lost, gained, changedStates, failedStates }
}
