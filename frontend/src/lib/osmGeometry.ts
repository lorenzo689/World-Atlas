import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'

export type BorderTile = { borders: Float32Array; disputed: Float32Array; coast: Float32Array }
export const BORDER_SURFACE = 100.0005

/** Clip buffered MVT segments before projecting: tile-edge water polygons are not coastlines. */
export function clipSegment(ax: number, ay: number, bx: number, by: number, extent: number): number[] | null {
  const dx = bx - ax; const dy = by - ay
  let lo = 0; let hi = 1
  for (const [p, q] of [[-dx, ax], [dx, extent - ax], [-dy, ay], [dy, extent - ay]]) {
    if (p === 0) { if (q < 0) return null; continue }
    const t = q / p
    if (p < 0) lo = Math.max(lo, t)
    else hi = Math.min(hi, t)
    if (lo >= hi) return null
  }
  return [ax + lo * dx, ay + lo * dy, ax + hi * dx, ay + hi * dy]
}

export function decodeBorders(buffer: ArrayBuffer, z: number, x: number, y: number): BorderTile {
  const tile = new VectorTile(new PbfReader(buffer))
  const borders: number[] = []; const disputed: number[] = []; const coast: number[] = []
  const n = 2 ** z
  for (const name of ['boundary', 'water']) {
    const layer = tile.layers[name]
    if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i); const p = f.properties
      if (name === 'boundary' && (Number(p.admin_level) !== 2 || Number(p.maritime ?? 0) !== 0)) continue
      if (name === 'water' && p.class !== 'ocean') continue
      const out = name === 'water' ? coast : Number(p.disputed ?? 0) === 1 ? disputed : borders
      for (const line of f.loadGeometry()) for (let j = 1; j < line.length; j++) {
        const a = line[j - 1]; const b = line[j]
        const s = clipSegment(a.x, a.y, b.x, b.y, layer.extent)
        if (!s) continue
        if (name === 'water' && ((s[0] === s[2] && (s[0] === 0 || s[0] === layer.extent))
          || (s[1] === s[3] && (s[1] === 0 || s[1] === layer.extent)))) continue
        const lng = (v: number) => ((x + v / layer.extent) / n * 360 - 180) * Math.PI / 180
        const lat = (v: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v / layer.extent) / n)))
        const aLng = lng(s[0]); const bLng = lng(s[2]); const aLat = lat(s[1]); const bLat = lat(s[3])
        // Short chords remain above the imagery mesh, including at deep zoom.
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bLng - aLng), Math.abs(bLat - aLat)) / 0.001))
        const point = (t: number) => {
          const la = aLat + (bLat - aLat) * t; const ln = aLng + (bLng - aLng) * t
          out.push(BORDER_SURFACE * Math.cos(la) * Math.sin(ln), BORDER_SURFACE * Math.sin(la), BORDER_SURFACE * Math.cos(la) * Math.cos(ln))
        }
        for (let k = 0; k < steps; k++) { point(k / steps); point((k + 1) / steps) }
        if (out.length > 3_000_000) throw Error('Border geometry budget exceeded')
      }
    }
  }
  return { borders: new Float32Array(borders), disputed: new Float32Array(disputed), coast: new Float32Array(coast) }
}
