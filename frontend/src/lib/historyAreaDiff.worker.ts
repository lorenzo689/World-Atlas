import { differenceBetweenAreas, type PolygonPair } from './historyAreaMath'

// The geometry package checks window.THREE at module evaluation, although its math also runs in a
// worker. Give it an empty browser-global shim before importing; no DOM or WebGL is used here.
;(globalThis as unknown as { window: Record<string, unknown> }).window = {}
const geometryModule = import('three-conic-polygon-geometry')

function mesh(polygons: number[][][][], ConicPolygonGeometry: (typeof import('three-conic-polygon-geometry'))['default']): { positions: Float32Array; indices: Uint32Array } {
  const positions: number[] = []
  const indices: number[] = []
  for (const polygon of polygons) {
    const geometry = new ConicPolygonGeometry(polygon, 100.008, 100.008, false, true, false, 6)
    const points = geometry.getAttribute('position').array
    const base = positions.length / 3
    for (let i = 0; i < points.length; i++) positions.push(points[i])
    const sourceIndices = geometry.index?.array
    if (sourceIndices) for (let i = 0; i < sourceIndices.length; i++) indices.push(base + sourceIndices[i])
    else for (let i = 0; i < points.length / 3; i++) indices.push(base + i)
    geometry.dispose()
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

self.onmessage = async (event: MessageEvent<PolygonPair[]>) => {
  try {
    const { default: ConicPolygonGeometry } = await geometryModule
    const difference = differenceBetweenAreas(event.data)
    const lost = mesh(difference.lost, ConicPolygonGeometry)
    const gained = mesh(difference.gained, ConicPolygonGeometry)
    self.postMessage(
      { lost, gained, changedStates: difference.changedStates, failedStates: difference.failedStates },
      { transfer: [lost.positions.buffer, lost.indices.buffer, gained.positions.buffer, gained.indices.buffer] },
    )
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
