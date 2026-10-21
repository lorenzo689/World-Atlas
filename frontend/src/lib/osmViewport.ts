/** Unwrapped longitude bounds allow a viewport to cross the date line without requesting the world. */
export function viewportTiles(west: number, east: number, south: number, north: number, budget: number): string[] {
  if (south < -85 || north > 85 || east - west > 100) return []
  for (let z = 10; z >= 5; z--) {
    const n = 2 ** z
    const tx = (lng: number) => Math.floor((lng + 180) / 360 * n)
    const ty = (lat: number) => Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)))
    const x0 = tx(west); const x1 = tx(east); const y0 = ty(north); const y1 = ty(south)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > budget) continue
    const tiles: { key: string; distance: number }[] = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      tiles.push({ key: `${z}/${((x % n) + n) % n}/${y}`, distance: Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2) })
    }
    return tiles.sort((a, b) => a.distance - b.distance).map((t) => t.key)
  }
  return []
}
