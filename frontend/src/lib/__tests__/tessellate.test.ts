import { describe, expect, it } from 'vitest'
import { tessellateCountries } from '../tessellate'
import type { CountryFeature } from '../geo'

// A 10° × 10° square. The fallback must produce the same layout as scripts/build-data.mjs:
// (lng, lat) pairs, triangle indices and one [code, vStart, vCount, iStart, iCount] range per country.
const square = (code: string, lng: number): CountryFeature =>
  ({
    type: 'Feature',
    properties: { code, name: code },
    geometry: { type: 'Polygon', coordinates: [[[lng, 0], [lng, 10], [lng + 10, 10], [lng + 10, 0], [lng, 0]]] },
  }) as CountryFeature

describe('tessellateCountries (fallback when geometry.bin is missing)', () => {
  it('returns vertices inside each polygon and contiguous per-country ranges', () => {
    const geo = tessellateCountries([square('AAA', 0), square('BBB', 20)])

    expect(geo.ranges.map((r) => r[0])).toEqual(['AAA', 'BBB'])
    const [, v0, vCount0, i0, iCount0] = geo.ranges[0]
    const [, v1, , i1, iCount1] = geo.ranges[1]
    expect(v0).toBe(0)
    expect(i0).toBe(0)
    expect(v1).toBe(vCount0)
    expect(i1).toBe(iCount0)
    expect(iCount0 % 3).toBe(0) // whole triangles
    expect(i1 + iCount1).toBe(geo.indices.length)
    expect(geo.lnglat.length / 2).toBe(geo.ranges.reduce((n, r) => n + r[2], 0))

    // Edges are subdivided along great circles, so the edge at 10°N bulges poleward (to ≈10.04°N
    // midway); 0.1° covers that while still catching vertices from the wrong polygon (20° away).
    const tol = 0.1
    for (const [, vStart, vCount, , , lng0] of geo.ranges.map((r, k) => [...r, k * 20] as const)) {
      for (let v = vStart; v < vStart + vCount; v++) {
        const lng = geo.lnglat[v * 2]
        const lat = geo.lnglat[v * 2 + 1]
        expect(lng).toBeGreaterThanOrEqual(lng0 - tol)
        expect(lng).toBeLessThanOrEqual(lng0 + 10 + tol)
        expect(lat).toBeGreaterThanOrEqual(-tol)
        expect(lat).toBeLessThanOrEqual(10 + tol)
      }
    }
    // Every index points into its own country's vertex range.
    for (let i = i1; i < i1 + iCount1; i++) expect(geo.indices[i]).toBeGreaterThanOrEqual(v1)
  })
})
