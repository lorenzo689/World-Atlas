import type { Territory, TerritoryArea } from './territories'
import { globePolygon } from './globePolygon'

;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
const geometryModule = import('three-conic-polygon-geometry')

// Outline radius: just above the area fill (100.6) so the edge stays visible on top of it.
const OUTLINE_RADIUS = 100.7
const toXYZ = (lng: number, lat: number, out: number[]) => {
  // Same convention as polarToXYZ in globeLayers.ts (kept local: the worker must not load three).
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  out.push(OUTLINE_RADIUS * Math.sin(phi) * Math.cos(theta), OUTLINE_RADIUS * Math.cos(phi), OUTLINE_RADIUS * Math.sin(phi) * Math.sin(theta))
}
/**
 * Every ring (outer boundary and holes) as line segments. Edges longer than half a degree are
 * subdivided along the great circle, so long straight edges do not cut through the globe.
 */
function outline(polygons: number[][][][]): Float32Array {
  const out: number[] = []
  for (const polygon of polygons) for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const [lng0, lat0] = ring[i - 1], [lng1, lat1] = ring[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(lng1 - lng0, lat1 - lat0) / 0.5))
      for (let s = 0; s < steps; s++) {
        const a = s / steps, b = (s + 1) / steps
        toXYZ(lng0 + (lng1 - lng0) * a, lat0 + (lat1 - lat0) * a, out)
        toXYZ(lng0 + (lng1 - lng0) * b, lat0 + (lat1 - lat0) * b, out)
      }
    }
  }
  return Float32Array.from(out)
}

self.onmessage = async (event: MessageEvent<Territory[]>) => {
  try {
    const { default: ConicPolygonGeometry } = await geometryModule
    const areas: TerritoryArea[] = event.data.map((feature) => {
      const positions: number[] = []
      const indices: number[] = []
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
      for (const polygon of polygons) {
        // Clear the political caps (100.3), including chord sag between tessellation vertices.
        // Depth writing stays off so source border/front lines remain legible. Holes stay empty.
        const geometry = new ConicPolygonGeometry(globePolygon(polygon), 100.6, 100.6, false, true, false, 2)
        const points = geometry.getAttribute('position').array
        const base = positions.length / 3
        for (const point of points) positions.push(point)
        const source = geometry.index?.array
        if (source) for (const index of source) indices.push(base + index)
        else for (let i = 0; i < points.length / 3; i++) indices.push(base + i)
        geometry.dispose()
      }
      return { id: feature.id, color: feature.color, mesh: { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }, outline: outline(polygons as number[][][][]) }
    })
    self.postMessage({ areas }, { transfer: areas.flatMap(({ mesh, outline }) => [mesh.positions.buffer, mesh.indices.buffer, ...(outline ? [outline.buffer] : [])]) })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
