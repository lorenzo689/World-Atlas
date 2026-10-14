import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three'
import ConicPolygonGeometry from 'three-conic-polygon-geometry'
import { geoContains } from 'd3-geo'
import type { CountryFeature } from '@/lib/geo'

// three-globe draws the sphere with radius 100 and maps (lat, lng) with this convention.
const GLOBE_RADIUS = 100
const CAP_RADIUS = GLOBE_RADIUS * 1.003
const BORDER_RADIUS = GLOBE_RADIUS * 1.0035
const CURVATURE_RESOLUTION = 6

type Ring = number[][]
type PolygonCoords = Ring[]

function polygonsOf(f: CountryFeature): PolygonCoords[] {
  const g = f.geometry
  if (g.type === 'Polygon') return [g.coordinates as PolygonCoords]
  if (g.type === 'MultiPolygon') return g.coordinates as PolygonCoords[]
  return []
}

function toXYZ(lng: number, lat: number, r: number, out: number[]) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  out.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

interface Piece {
  code: string
  coords: PolygonCoords
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

/**
 * All countries as two draw calls (one merged, vertex-coloured cap mesh and one merged border
 * line set) plus a cheap point-in-polygon picker.
 *
 * Replaces react-globe.gl's polygons layer for the base map: that layer creates a Group with
 * three meshes per polygon piece (1,600+ pieces → ~4,800 draw calls per frame), which is what
 * made rotating the globe unusable.
 */
export class BaseLayers {
  readonly group = new Group()
  readonly caps: Mesh
  readonly borders: LineSegments
  private ranges = new Map<string, [number, number]>()
  private colors: Float32BufferAttribute
  private pieces: Piece[] = []
  private tmp = new Color()

  constructor(features: CountryFeature[]) {
    const pos: number[] = []
    const idx: number[] = []
    const lines: number[] = []

    for (const f of features) {
      const start = pos.length / 3
      for (const coords of polygonsOf(f)) {
        let minLng = Infinity
        let maxLng = -Infinity
        let minLat = Infinity
        let maxLat = -Infinity
        for (const [lng, lat] of coords[0]) {
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        }
        this.pieces.push({ code: f.properties.code, coords, minLng, maxLng, minLat, maxLat })

        // cap
        const geo = new ConicPolygonGeometry(coords, CAP_RADIUS, CAP_RADIUS, false, true, false, CURVATURE_RESOLUTION)
        const p = geo.attributes.position.array
        const base = pos.length / 3
        for (let i = 0; i < p.length; i++) pos.push(p[i])
        const index = geo.index?.array
        if (index) for (let i = 0; i < index.length; i++) idx.push(base + index[i])
        else for (let i = 0; i < p.length / 3; i++) idx.push(base + i)
        geo.dispose()

        // borders
        for (const ring of coords) {
          for (let i = 0; i < ring.length - 1; i++) {
            toXYZ(ring[i][0], ring[i][1], BORDER_RADIUS, lines)
            toXYZ(ring[i + 1][0], ring[i + 1][1], BORDER_RADIUS, lines)
          }
        }
      }
      this.ranges.set(f.properties.code, [start, pos.length / 3 - start])
    }

    const capGeo = new BufferGeometry()
    capGeo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    this.colors = new Float32BufferAttribute(new Float32Array(pos.length).fill(0.4), 3)
    capGeo.setAttribute('color', this.colors)
    capGeo.setIndex(idx)
    this.caps = new Mesh(capGeo, new MeshBasicMaterial({ vertexColors: true }))
    this.caps.frustumCulled = false

    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new Float32BufferAttribute(lines, 3))
    this.borders = new LineSegments(
      lineGeo,
      new LineBasicMaterial({ transparent: true, depthWrite: false }),
    )
    this.borders.frustumCulled = false

    // Picking is done by `pick()`; keep these out of globe.gl's per-event raycast (and out of the
    // way of its click-on-globe detection).
    this.caps.raycast = () => {}
    this.borders.raycast = () => {}

    this.group.add(this.caps, this.borders)
  }

  /** Recolour every country's cap (cheap: rewrites one attribute). */
  setCapColors(colorFor: (code: string) => string) {
    const arr = this.colors.array as Float32Array
    for (const [code, [start, count]] of this.ranges) {
      this.tmp.set(colorFor(code))
      const { r, g, b } = this.tmp
      for (let v = start; v < start + count; v++) {
        arr[v * 3] = r
        arr[v * 3 + 1] = g
        arr[v * 3 + 2] = b
      }
    }
    this.colors.needsUpdate = true
  }

  setBorder(color: string, opacity: number) {
    const m = this.borders.material as LineBasicMaterial
    m.color.set(color)
    m.opacity = opacity
  }

  /** Alpha-3 code of the country containing the point, if any. */
  pick(lng: number, lat: number): string | null {
    if (lng > 180) lng -= 360
    if (lng < -180) lng += 360
    for (const p of this.pieces) {
      if (lng < p.minLng || lng > p.maxLng || lat < p.minLat || lat > p.maxLat) continue
      if (geoContains({ type: 'Polygon', coordinates: p.coords }, [lng, lat])) return p.code
    }
    return null
  }

  dispose() {
    this.caps.geometry.dispose()
    ;(this.caps.material as MeshBasicMaterial).dispose()
    this.borders.geometry.dispose()
    ;(this.borders.material as LineBasicMaterial).dispose()
  }
}
