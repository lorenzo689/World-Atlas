import { describe, expect, it } from 'vitest'
import { differenceBetweenBorders } from '../historyBoundaryDiff'
import type { HistoricalSnapshot } from '../history'

const snapshot = (borders: number[][][]): HistoricalSnapshot => ({
  year: 1990,
  entities: new Map(),
  boundaries: { type: 'FeatureCollection', features: [], borders },
})

describe('differenceBetweenBorders', () => {
  it('ignores unchanged segments even when their direction is reversed', () => {
    const before = snapshot([[[0, 0], [1, 0]], [[2, 0], [3, 0]]])
    const after = snapshot([[[1, 0], [0, 0]], [[2, 0], [2, 1]]])
    const diff = differenceBetweenBorders(before, after)
    expect(diff.removed).toEqual([[[2, 0], [3, 0]]])
    expect(diff.added).toEqual([[[2, 0], [2, 1]]])
    expect(diff.removedKm).toBeGreaterThan(100)
  })

  it('reports no change for identical geography', () => {
    const before = snapshot([[[12, 48], [13, 49]]])
    const diff = differenceBetweenBorders(before, snapshot([[[12, 48], [13, 49]]]))
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
  })
})
