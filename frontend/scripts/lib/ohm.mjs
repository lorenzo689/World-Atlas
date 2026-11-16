// OpenHistoricalMap (CC0) boundary relations: cached download and polygon assembly.
// Shared by the WWII build scripts. Every relation is pinned by its start/end dates: if OHM editors
// change them, the build stops instead of silently shipping a different boundary.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'

const CACHE = 'scripts/source/historical'
const key = (point) => `${point[0]},${point[1]}`

/** Joins way members of one role into closed rings (ways may be split and reversed arbitrarily). */
function rings(relation, role) {
  const segments = relation.members
    .filter((member) => member.type === 'way' && member.role === role)
    .map((member) => {
      if (!Array.isArray(member.geometry) || member.geometry.length < 2) throw new Error(`Incomplete way ${member.ref} in relation ${relation.id}`)
      return member.geometry.map((point) => [point.lon, point.lat])
    })
  const ends = new Map()
  segments.forEach((segment, i) => {
    for (const end of [segment[0], segment.at(-1)]) {
      if (!ends.has(key(end))) ends.set(key(end), [])
      ends.get(key(end)).push(i)
    }
  })
  const unused = new Set(segments.map((_, i) => i))
  const out = []
  while (unused.size) {
    const first = unused.values().next().value
    unused.delete(first)
    const ring = [...segments[first]]
    while (key(ring[0]) !== key(ring.at(-1))) {
      const tail = key(ring.at(-1))
      const next = (ends.get(tail) ?? []).find((i) => unused.has(i))
      if (next === undefined) throw new Error(`Open ${role} boundary in relation ${relation.id} at ${tail}`)
      unused.delete(next)
      const segment = segments[next]
      ring.push(...(key(segment[0]) === tail ? segment : [...segment].reverse()).slice(1))
    }
    if (ring.length >= 4) out.push(ring)
  }
  return out
}

/**
 * polygon-clipping returns planar counter-clockwise exterior rings; d3-geo (and the globe) read a
 * ring's interior on its right-hand side, i.e. expect clockwise exteriors. Without this the polygon
 * would mean "the whole Earth except this area".
 */
export const forSphere = (coordinates) => coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse()))

/** Outer rings minus inner rings, as polygon-clipping MultiPolygon coordinates. */
export function polygonFromRelation(relation) {
  const outer = rings(relation, 'outer')
  if (!outer.length) throw new Error(`Relation ${relation.id} has no closed outer ring`)
  const inner = rings(relation, 'inner')
  const shell = polygonClipping.union(...outer.map((ring) => [[ring]]))
  return inner.length ? polygonClipping.difference(shell, ...inner.map((ring) => [[ring]])) : shell
}

/**
 * Loads one relation (from cache, else Overpass) and checks its dates.
 * @returns {{ coordinates: number[][][][], provenance: { id: number, source: string, sha256: string }, tags: object }}
 */
export async function ohmRelation(id, start, end, { refresh = false } = {}) {
  mkdirSync(CACHE, { recursive: true })
  const path = `${CACHE}/ohm-ww2-${id}.json`
  if (!existsSync(path) || refresh) {
    let saved = false
    for (const suffix of ['out geom;', 'out geom qt;']) {
      const query = `[out:json][timeout:240];relation(${id});${suffix}`
      const response = await fetch('https://overpass-api.openhistoricalmap.org/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) })
      const body = await response.text()
      if (!response.ok || !body.trimStart().startsWith('{')) continue
      if (!JSON.parse(body).elements?.some((e) => e.type === 'relation' && e.id === id)) continue
      writeFileSync(path, body)
      saved = true
      break
    }
    if (!saved) throw new Error(`OHM relation ${id} unavailable; no cache was changed`)
  }
  const source = readFileSync(path)
  const relation = JSON.parse(source.toString('utf8')).elements.find((e) => e.type === 'relation' && e.id === id)
  if (relation.tags?.start_date !== start || relation.tags?.end_date !== end) {
    throw new Error(`OHM relation ${id} dates are ${relation.tags?.start_date}..${relation.tags?.end_date}, expected ${start}..${end}; review before rebuilding`)
  }
  return {
    coordinates: polygonFromRelation(relation),
    tags: relation.tags,
    provenance: { id, source: `https://www.openhistoricalmap.org/relation/${id}`, sha256: createHash('sha256').update(source).digest('hex') },
  }
}
