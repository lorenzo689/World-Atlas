/** d3 spherical containment expects clockwise exteriors and counterclockwise holes.
 * Polygon-clipping and GeoJSON sources often use the opposite (RFC 7946) winding.
 * Normalize on a copy so a regional cap cannot accidentally triangulate its global complement.
 */
export function globePolygon(polygon: number[][][]): number[][][] {
  return polygon.map((ring, index) => {
    let signedArea = 0
    for (let i = 1; i < ring.length; i++) signedArea += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
    const clockwise = signedArea < 0
    return clockwise === (index === 0) ? ring : [...ring].reverse()
  })
}
