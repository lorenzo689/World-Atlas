import { describe, expect, it } from 'vitest'
import { differenceBetweenAreas } from '../historyAreaMath'

describe('differenceBetweenAreas', () => {
  it('returns only territory outside the overlap', () => {
    const result = differenceBetweenAreas([{
      code: 'A',
      before: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      after: [[[1, 0], [3, 0], [3, 2], [1, 2], [1, 0]]],
    }])
    expect(result.changedStates).toBe(1)
    expect(result.lost).toHaveLength(1)
    expect(result.gained).toHaveLength(1)
    expect(result.lost[0][0].every(([x]) => x <= 1)).toBe(true)
    expect(result.gained[0][0].every(([x]) => x >= 2)).toBe(true)
  })

  it('keeps identical areas empty', () => {
    const square: [number, number][][] = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
    const result = differenceBetweenAreas([{ code: 'A', before: square, after: square }])
    expect(result.changedStates).toBe(0)
    expect(result.lost).toHaveLength(0)
    expect(result.gained).toHaveLength(0)
  })
})
