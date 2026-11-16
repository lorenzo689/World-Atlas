import ConicPolygonGeometry from 'three-conic-polygon-geometry'
import type { CountryFeature } from '@/lib/geo'
import { CAP_RADIUS, CURVATURE_RESOLUTION, polygonsOf, xyzToPolar, type PrecomputedGeometry } from '@/lib/globeLayers'

/**
 * Emergency fallback when public/data/geometry.bin cannot be loaded: triangulates the country caps
 * in the browser, in the same (lng, lat) layout that scripts/build-data.mjs writes.
 *
 * This takes several seconds on the main thread and pulls in three-conic-polygon-geometry with its
 * d3/turf/delaunator dependencies (~43 kB minified). It is therefore its own module, loaded with a
 * dynamic import() only when the precomputed file is missing, instead of being part of every
 * visitor's globe bundle.
 */
export function tessellateCountries(features: CountryFeature[]): PrecomputedGeometry {
  const lnglat: number[] = []
  const indices: number[] = []
  const ranges: PrecomputedGeometry['ranges'] = []
  for (const f of features) {
    const vStart = lnglat.length / 2
    const iStart = indices.length
    for (const coords of polygonsOf(f)) {
      const geo = new ConicPolygonGeometry(coords, CAP_RADIUS, CAP_RADIUS, false, true, false, CURVATURE_RESOLUTION)
      const p = geo.attributes.position.array
      const base = lnglat.length / 2
      for (let i = 0; i < p.length; i += 3) {
        const { lat, lng } = xyzToPolar(p[i], p[i + 1], p[i + 2])
        lnglat.push(lng, lat)
      }
      const index = geo.index?.array
      if (index) for (let i = 0; i < index.length; i++) indices.push(base + index[i])
      else for (let i = 0; i < p.length / 3; i++) indices.push(base + i)
      geo.dispose()
    }
    ranges.push([f.properties.code, vStart, lnglat.length / 2 - vStart, iStart, indices.length - iStart])
  }
  return { lnglat: new Float32Array(lnglat), indices: Uint32Array.from(indices), ranges }
}
