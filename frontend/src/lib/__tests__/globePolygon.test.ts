import { describe, expect, it } from 'vitest'
import { geoContains } from 'd3-geo'
import { globePolygon } from '../globePolygon'

describe('spherical polygon winding', () => {
  it('fills a regional exterior and leaves its holes and global complement empty', () => {
    const input = [[[0,0],[5,0],[5,5],[0,5],[0,0]], [[1,1],[1,3],[3,3],[3,1],[1,1]]]
    const polygon = { type: 'Polygon' as const, coordinates: globePolygon(input) }
    expect(geoContains(polygon, [4,4])).toBe(true)
    expect(geoContains(polygon, [2,2])).toBe(false)
    expect(geoContains(polygon, [90,45])).toBe(false)
    expect(input[0][1]).toEqual([5,0])
    expect(globePolygon(polygon.coordinates)).toEqual(polygon.coordinates)
  })
})
