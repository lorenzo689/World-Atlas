import { describe, expect, it } from 'vitest'
import { poseForFeature, poseForPoint, type CountryFeature } from '../geo'

// d3-geo expects exterior rings to wind clockwise (as topojson-client emits them).
const square = (w: number, s: number, e: number, n: number): number[][] => [
  [w, s],
  [w, n],
  [e, n],
  [e, s],
  [w, s],
]

const feature = (geometry: CountryFeature['geometry']): CountryFeature => ({
  type: 'Feature',
  properties: { code: 'TST', name: 'Test' },
  geometry,
})

describe('camera framing', () => {
  it('centres on the polygon', () => {
    const p = poseForFeature(feature({ type: 'Polygon', coordinates: [square(10, 40, 20, 50)] }))
    expect(p.lng).toBeCloseTo(15, 0)
    expect(p.lat).toBeGreaterThan(44)
    expect(p.lat).toBeLessThan(46)
  })

  it('zooms out further for larger countries and clamps the range', () => {
    const small = poseForFeature(feature({ type: 'Polygon', coordinates: [square(5, 5, 5.2, 5.2)] }))
    const big = poseForFeature(feature({ type: 'Polygon', coordinates: [square(-60, -30, 40, 50)] }))
    expect(small.altitude).toBeLessThan(big.altitude)
    expect(small.altitude).toBeGreaterThanOrEqual(0.14)
    expect(big.altitude).toBeLessThanOrEqual(2.4)
  })

  it('ignores remote exclaves by framing the largest landmass', () => {
    const p = poseForFeature(
      feature({
        type: 'MultiPolygon',
        coordinates: [[square(0, 40, 10, 50)], [square(-160, 19, -155, 22)]],
      }),
    )
    expect(p.lng).toBeCloseTo(5, 0)
  })

  it('builds a pose from a plain lat/lng pair', () => {
    expect(poseForPoint([36.2, 138.2])).toEqual({ lat: 36.2, lng: 138.2, altitude: 0.18 })
    expect(poseForPoint(null)).toBeNull()
  })
})
