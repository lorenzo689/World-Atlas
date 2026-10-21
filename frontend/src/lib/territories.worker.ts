import type { Territory, TerritoryArea } from './territories'
import { globePolygon } from './globePolygon'

;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
const geometryModule = import('three-conic-polygon-geometry')

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
      return { id: feature.id, color: feature.color, mesh: { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) } }
    })
    self.postMessage({ areas }, { transfer: areas.flatMap(({ mesh }) => [mesh.positions.buffer, mesh.indices.buffer]) })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
