import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
} from 'three'
import ConicPolygonGeometry from 'three-conic-polygon-geometry'
import { geoContains } from 'd3-geo'
import type { CountryFeature } from '@/lib/geo'

// The globe sphere has radius 100 and (lat, lng) map to xyz with this convention (same as three-globe).
export const GLOBE_RADIUS = 100
const CAP_RADIUS = GLOBE_RADIUS * 1.003
const BORDER_RADIUS = GLOBE_RADIUS * 1.0035
const CURVATURE_RESOLUTION = 6

type Ring = number[][]
type PolygonCoords = Ring[]

export function polarToXYZ(lat: number, lng: number, r: number, out: number[] | Float32Array, at = -1) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  const s = Math.sin(phi)
  const x = r * s * Math.cos(theta)
  const y = r * Math.cos(phi)
  const z = r * s * Math.sin(theta)
  if (Array.isArray(out)) out.push(x, y, z)
  else {
    out[at] = x
    out[at + 1] = y
    out[at + 2] = z
  }
}

export function xyzToPolar(x: number, y: number, z: number) {
  const r = Math.sqrt(x * x + y * y + z * z)
  const phi = Math.acos(y / r)
  const theta = Math.atan2(z, x)
  return {
    lat: 90 - (phi * 180) / Math.PI,
    lng: 90 - (theta * 180) / Math.PI - (theta < -Math.PI / 2 ? 360 : 0),
    altitude: r / GLOBE_RADIUS - 1,
  }
}

function polygonsOf(f: CountryFeature): PolygonCoords[] {
  const g = f.geometry
  if (g.type === 'Polygon') return [g.coordinates as PolygonCoords]
  if (g.type === 'MultiPolygon') return g.coordinates as PolygonCoords[]
  return []
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
 * Cap triangulation computed at build time (scripts/build-data.mjs): vertices as (lng, lat) pairs,
 * indices into them, and per-country [code, vertexStart, vertexCount, indexStart, indexCount].
 * Tessellating the 1,600+ polygon pieces in the browser takes seconds on the main thread.
 */
export interface PrecomputedGeometry {
  lnglat: Float32Array
  indices: Uint32Array
  ranges: [string, number, number, number, number][]
}

export interface HighlightStyle {
  capColor: string
  capOpacity: number
  lineColor: string
  lineOpacity: number
  /** Relative lift above the surface (1 + altitude scales the meshes). */
  altitude: number
}

/** One highlighted country: a re-ranged view onto the shared cap buffers plus a cached outline. */
class HighlightSlot {
  readonly group = new Group()
  private cap: Mesh
  private line: LineSegments
  private capMat = new MeshBasicMaterial({ transparent: true, depthWrite: false })
  private lineMat = new LineBasicMaterial({ transparent: true, depthWrite: false })
  private capGeo = new BufferGeometry()
  code: string | null = null

  constructor(
    private layers: BaseLayers,
    private capIndexRanges: Map<string, [number, number]>,
  ) {
    const caps = layers.caps.geometry
    // Share the vertex + index buffers of the base cap mesh; only the draw range differs.
    this.capGeo.setAttribute('position', caps.getAttribute('position'))
    this.capGeo.setIndex(caps.getIndex())
    this.cap = new Mesh(this.capGeo, this.capMat)
    this.line = new LineSegments(new BufferGeometry(), this.lineMat)
    this.cap.frustumCulled = false
    this.line.frustumCulled = false
    this.cap.raycast = () => {}
    this.line.raycast = () => {}
    this.cap.renderOrder = 2
    this.line.renderOrder = 3
    this.group.add(this.cap, this.line)
    this.group.visible = false
  }

  set(code: string | null) {
    this.code = code
    const range = code ? this.capIndexRanges.get(code) : undefined
    if (!code || !range) {
      this.group.visible = false
      return
    }
    this.capGeo.setDrawRange(range[0], range[1])
    this.line.geometry = this.layers.outlineGeometry(code)
    this.group.visible = true
  }

  style(s: HighlightStyle) {
    this.capMat.color.set(s.capColor)
    this.capMat.opacity = s.capOpacity
    this.lineMat.color.set(s.lineColor)
    this.lineMat.opacity = s.lineOpacity
    this.group.scale.setScalar(1 + s.altitude)
  }

  setOutlineVisible(visible: boolean) {
    this.line.visible = visible
  }

  dispose() {
    this.capMat.dispose()
    this.lineMat.dispose()
    // capGeo shares buffers with the base mesh, which owns (and disposes) them.
  }
}

/**
 * The whole map in a handful of draw calls:
 *  - one merged, vertex-coloured cap mesh (political / data modes),
 *  - one merged line set for every border (each shared border once),
 *  - two highlight slots (hover, selected) that reuse the cap buffers via draw ranges.
 *
 * react-globe.gl's polygons layer would create a Group with three meshes per polygon piece
 * (1,600+ pieces → ~4,800 draw calls per frame), which is what made the globe unusable.
 */
export class BaseLayers {
  readonly group = new Group()
  readonly caps: Mesh
  readonly borders: LineSegments
  readonly changeLines: LineSegments
  readonly changeAreas: Mesh
  readonly hover: HighlightSlot
  readonly selected: HighlightSlot
  /** a second, persistent highlight (country comparison) */
  readonly secondary: HighlightSlot
  /** pins on the surface (e.g. where other players clicked) – one draw call for all of them */
  readonly markers: Points
  private ranges = new Map<string, [number, number]>() // code -> vertex [start, count]
  private pieces: Piece[] = []
  private piecesByCode = new Map<string, Piece[]>()
  private colors: Float32BufferAttribute
  private tmp = new Color()
  private outlines = new Map<string, BufferGeometry>()
  private lastPick: Piece | null = null

  constructor(features: CountryFeature[], borders?: number[][][], pre?: PrecomputedGeometry | null) {
    // pieces (for picking + outlines)
    for (const f of features) {
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
        const piece: Piece = { code: f.properties.code, coords, minLng, maxLng, minLat, maxLat }
        this.pieces.push(piece)
        const list = this.piecesByCode.get(piece.code)
        if (list) list.push(piece)
        else this.piecesByCode.set(piece.code, [piece])
      }
    }

    let pos: Float32Array
    let idx: Uint32Array
    const indexRanges = new Map<string, [number, number]>()

    if (pre) {
      const n = pre.lnglat.length / 2
      pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) polarToXYZ(pre.lnglat[i * 2 + 1], pre.lnglat[i * 2], CAP_RADIUS, pos, i * 3)
      idx = pre.indices
      for (const [code, vStart, vCount, iStart, iCount] of pre.ranges) {
        this.ranges.set(code, [vStart, vCount])
        indexRanges.set(code, [iStart, iCount])
      }
    } else {
      // Fallback (no precomputed file): tessellate here. Slow: several seconds.
      const p: number[] = []
      const ix: number[] = []
      for (const f of features) {
        const vStart = p.length / 3
        const iStart = ix.length
        for (const coords of polygonsOf(f)) {
          const geo = new ConicPolygonGeometry(coords, CAP_RADIUS, CAP_RADIUS, false, true, false, CURVATURE_RESOLUTION)
          const arr = geo.attributes.position.array
          const base = p.length / 3
          for (let i = 0; i < arr.length; i++) p.push(arr[i])
          const index = geo.index?.array
          if (index) for (let i = 0; i < index.length; i++) ix.push(base + index[i])
          else for (let i = 0; i < arr.length / 3; i++) ix.push(base + i)
          geo.dispose()
        }
        this.ranges.set(f.properties.code, [vStart, p.length / 3 - vStart])
        indexRanges.set(f.properties.code, [iStart, ix.length - iStart])
      }
      pos = new Float32Array(p)
      idx = Uint32Array.from(ix)
    }

    const capGeo = new BufferGeometry()
    capGeo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    this.colors = new Float32BufferAttribute(new Float32Array(pos.length).fill(0.4), 3)
    capGeo.setAttribute('color', this.colors)
    capGeo.setIndex(new BufferAttribute(idx, 1))
    this.caps = new Mesh(capGeo, new MeshBasicMaterial({ vertexColors: true }))
    this.caps.frustumCulled = false

    // Every border once (from the shared-arc topology); falls back to per-ring lines.
    const lines: number[] = []
    const addLine = (pts: number[][]) => {
      for (let i = 0; i < pts.length - 1; i++) {
        polarToXYZ(pts[i][1], pts[i][0], BORDER_RADIUS, lines)
        polarToXYZ(pts[i + 1][1], pts[i + 1][0], BORDER_RADIUS, lines)
      }
    }
    if (borders) borders.forEach(addLine)
    else for (const p of this.pieces) p.coords.forEach(addLine)
    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new Float32BufferAttribute(lines, 3))
    this.borders = new LineSegments(lineGeo, new LineBasicMaterial({ transparent: true, depthWrite: false }))
    this.borders.frustumCulled = false
    this.borders.renderOrder = 1

    this.changeLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: '#f6c177', transparent: true, opacity: 0.95, depthWrite: false }),
    )
    this.changeLines.frustumCulled = false
    this.changeLines.raycast = () => {}
    this.changeLines.renderOrder = 5
    this.changeLines.visible = false

    this.changeAreas = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ color: '#f6c177', transparent: true, opacity: 0.5, depthWrite: false }),
    )
    this.changeAreas.frustumCulled = false
    this.changeAreas.raycast = () => {}
    this.changeAreas.renderOrder = 4
    this.changeAreas.visible = false

    // Picking is done by pick(); keep these out of any raycast.
    this.caps.raycast = () => {}
    this.borders.raycast = () => {}

    this.hover = new HighlightSlot(this, indexRanges)
    this.selected = new HighlightSlot(this, indexRanges)
    this.secondary = new HighlightSlot(this, indexRanges)

    this.markers = new Points(
      new BufferGeometry(),
      new PointsMaterial({
        size: 14,
        sizeAttenuation: false, // constant size in pixels, whatever the zoom
        vertexColors: true,
        map: dotTexture(),
        transparent: true,
        alphaTest: 0.3,
        depthWrite: false,
      }),
    )
    this.markers.frustumCulled = false
    this.markers.raycast = () => {}
    this.markers.renderOrder = 4
    this.markers.visible = false

    this.group.add(this.caps, this.borders, this.secondary.group, this.selected.group, this.hover.group, this.markers, this.changeAreas, this.changeLines)
  }

  /** Outline of one country (all rings), built on demand and cached. */
  outlineGeometry(code: string): BufferGeometry {
    const hit = this.outlines.get(code)
    if (hit) {
      this.outlines.delete(code)
      this.outlines.set(code, hit) // LRU touch
      return hit
    }
    const lines: number[] = []
    for (const piece of this.piecesByCode.get(code) ?? []) {
      for (const ring of piece.coords) {
        for (let i = 0; i < ring.length - 1; i++) {
          polarToXYZ(ring[i][1], ring[i][0], BORDER_RADIUS, lines)
          polarToXYZ(ring[i + 1][1], ring[i + 1][0], BORDER_RADIUS, lines)
        }
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(lines, 3))
    this.outlines.set(code, g)
    if (this.outlines.size > 24) {
      const [oldKey, old] = this.outlines.entries().next().value as [string, BufferGeometry]
      // never dispose a geometry that is currently shown
      if (oldKey !== this.hover.code && oldKey !== this.selected.code) {
        old.dispose()
        this.outlines.delete(oldKey)
      }
    }
    return g
  }

  /** Replaces all markers. Each marker is a coloured dot slightly above the surface. */
  setMarkers(markers: { lat: number; lng: number; color: string }[]) {
    const pos: number[] = []
    const col: number[] = []
    for (const m of markers) {
      polarToXYZ(m.lat, m.lng, GLOBE_RADIUS * 1.03, pos)
      this.tmp.set(m.color)
      col.push(this.tmp.r, this.tmp.g, this.tmp.b)
    }
    const g = this.markers.geometry
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    g.computeBoundingSphere()
    this.markers.visible = markers.length > 0
  }

  /** A single merged draw call for boundaries present in only one compared snapshot. */
  setChangeLines(lines: [number[], number[]][], color: string) {
    const positions: number[] = []
    for (const [a, b] of lines) {
      polarToXYZ(a[1], a[0], GLOBE_RADIUS * 1.006, positions)
      polarToXYZ(b[1], b[0], GLOBE_RADIUS * 1.006, positions)
    }
    this.changeLines.geometry.dispose()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.changeLines.geometry = geometry
    ;(this.changeLines.material as LineBasicMaterial).color.set(color)
    this.changeLines.visible = lines.length > 0
  }

  setChangeAreas(area: { positions: Float32Array; indices: Uint32Array } | null, color: string) {
    this.changeAreas.geometry.dispose()
    const geometry = new BufferGeometry()
    if (area && area.indices.length) {
      geometry.setAttribute('position', new BufferAttribute(area.positions, 3))
      geometry.setIndex(new BufferAttribute(area.indices, 1))
    }
    this.changeAreas.geometry = geometry
    ;(this.changeAreas.material as MeshBasicMaterial).color.set(color)
    this.changeAreas.visible = !!area?.indices.length
  }

  /** Centroid-ish point of a country (largest piece's bounding-box centre) for markers. */
  centerOf(code: string): { lat: number; lng: number } | null {
    const pieces = this.piecesByCode.get(code)
    if (!pieces?.length) return null
    let best = pieces[0]
    for (const p of pieces) {
      if ((p.maxLng - p.minLng) * (p.maxLat - p.minLat) > (best.maxLng - best.minLng) * (best.maxLat - best.minLat)) best = p
    }
    return { lat: (best.minLat + best.maxLat) / 2, lng: (best.minLng + best.maxLng) / 2 }
  }

  /** Recolour every country's cap (rewrites one attribute). */
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
    const inside = (p: Piece) =>
      lng >= p.minLng &&
      lng <= p.maxLng &&
      lat >= p.minLat &&
      lat <= p.maxLat &&
      geoContains({ type: 'Polygon', coordinates: p.coords }, [lng, lat])
    // The pointer mostly stays inside the same country: test that piece first.
    if (this.lastPick && inside(this.lastPick)) return this.lastPick.code
    for (const p of this.pieces) {
      if (p !== this.lastPick && inside(p)) {
        this.lastPick = p
        return p.code
      }
    }
    this.lastPick = null
    return null
  }

  dispose() {
    this.hover.dispose()
    this.selected.dispose()
    this.secondary.dispose()
    this.markers.geometry.dispose()
    ;(this.markers.material as PointsMaterial).map?.dispose()
    ;(this.markers.material as PointsMaterial).dispose()
    this.caps.geometry.dispose()
    ;(this.caps.material as MeshBasicMaterial).dispose()
    this.borders.geometry.dispose()
    ;(this.borders.material as LineBasicMaterial).dispose()
    this.changeLines.geometry.dispose()
    ;(this.changeLines.material as LineBasicMaterial).dispose()
    this.changeAreas.geometry.dispose()
    ;(this.changeAreas.material as MeshBasicMaterial).dispose()
    for (const g of this.outlines.values()) g.dispose()
    this.outlines.clear()
  }
}

/** A soft round dot with a dark outline, used as the point sprite for markers. */
function dotTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  g.beginPath()
  g.arc(32, 32, 26, 0, Math.PI * 2)
  g.fillStyle = '#ffffff'
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = 'rgba(6,16,31,0.85)'
  g.stroke()
  return new CanvasTexture(c)
}
