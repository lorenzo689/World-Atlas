import { describe, expect, it } from 'vitest'
import { buildChoropleth, DATA_RAMP, hash01, mix } from '../color'

describe('choropleth', () => {
  it('returns null when there are too few values to classify', () => {
    expect(buildChoropleth([1, 2, 3])).toBeNull()
  })

  it('assigns the lowest and highest ramp colours to the extremes', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    const s = buildChoropleth(values)!
    expect(s.color(1)).toBe(DATA_RAMP[0])
    expect(s.color(100)).toBe(DATA_RAMP[DATA_RAMP.length - 1])
    expect(s.breaks[0]).toBe(1)
    expect(s.breaks[s.breaks.length - 1]).toBe(100)
  })
})

describe('colour helpers', () => {
  it('mixes hex colours and stays re-mixable', () => {
    const half = mix('#000000', '#ffffff', 0.5)
    expect(half).toBe('#808080')
    expect(mix(half, '#ffffff', 1)).toBe('#ffffff')
  })

  it('hashes deterministically into [0,1)', () => {
    expect(hash01('DEU')).toBe(hash01('DEU'))
    expect(hash01('DEU')).toBeGreaterThanOrEqual(0)
    expect(hash01('DEU')).toBeLessThan(1)
  })
})
