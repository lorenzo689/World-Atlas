import type { PrecomputedGeometry } from '@/lib/globeLayers'
import { geoArea, geoBounds, geoCentroid } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson'

export interface CountryProps {
  code: string
  name: string
}
export type CountryFeature = Feature<Geometry, CountryProps>
export type Boundaries = FeatureCollection<Geometry, CountryProps> & {
  /** Every border / coastline segment exactly once (shared borders are not duplicated). */
  borders?: number[][][]
  /** Build-time cap triangulation (see PrecomputedGeometry). */
  geometry?: PrecomputedGeometry | null
}

export interface Pose {
  lat: number
  lng: number
  altitude: number
}

const EMPTY: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }

/** The biggest single landmass of a (Multi)Polygon, so island exclaves don't skew framing. */
export function largestPolygon(f: CountryFeature): Feature<Polygon> {
  const g = f.geometry
  if (g.type === 'Polygon') return { type: 'Feature', properties: {}, geometry: g }
  if (g.type !== 'MultiPolygon') return EMPTY
  let best: Polygon | null = null
  let bestArea = -1
  for (const coordinates of (g as MultiPolygon).coordinates) {
    const poly: Polygon = { type: 'Polygon', coordinates }
    const a = geoArea({ type: 'Feature', properties: {}, geometry: poly })
    if (a > bestArea) {
      best = poly
      bestArea = a
    }
  }
  return best ? { type: 'Feature', properties: {}, geometry: best } : EMPTY
}

/**
 * Camera pose that frames a country's main landmass.
 * Altitude is in globe radii (react-globe.gl convention). With the default 50° field of view the
 * visible width at the surface is ≈ 0.93 × altitude radians, so altitude ≈ span × ~2.3 leaves
 * breathing room for the info panel.
 */
export function poseForFeature(f: CountryFeature): Pose {
  const main = largestPolygon(f)
  const [lng, lat] = geoCentroid(main)
  const [[w, s], [e, n]] = geoBounds(main)
  let dLng = e - w
  if (dLng < 0) dLng += 360
  const spanDeg = Math.max(n - s, dLng * Math.cos((lat * Math.PI) / 180))
  const altitude = Math.min(2.4, Math.max(0.14, ((spanDeg * Math.PI) / 180) * 2.3 + 0.08))
  return { lat, lng, altitude }
}

export function poseForPoint(latlng: [number, number] | null): Pose | null {
  return latlng ? { lat: latlng[0], lng: latlng[1], altitude: 0.18 } : null
}
