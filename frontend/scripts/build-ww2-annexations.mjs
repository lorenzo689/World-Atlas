// Build the annual German Reich annexation footprints from dated OpenHistoricalMap
// boundary relations. This is administrative annexation, NOT military occupation.
// OHM data: CC0, https://www.openhistoricalmap.org/copyright
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import polygonClipping from 'polygon-clipping'

const sourceDir = 'scripts/source/historical'
const outputPath = 'scripts/data/ww2-annexations.geojson.gz'
const danzigPath = 'scripts/data/ww2-free-city-danzig.geojson'
// Sample days: 1 January of every war year (the "Changing borders" timeline) plus the date of every
// WWII learning moment, so the base map of a moment shows the borders of that exact day. For each
// day the Reich relation and the exclusions valid on that day (start <= day < end) are used.
const WW2_MOMENT_DAYS = [19390916, 19400604, 19411112, 19421118, 19431215, 19441215, 19450415]
const SAMPLE_DAYS = [...[1939, 1940, 1941, 1942, 1943, 1944, 1945].map((y) => y * 10000 + 101), ...WW2_MOMENT_DAYS].sort((a, b) => a - b)
const asDay = (date) => Number(date.replaceAll('-', '').padEnd(8, '0'))
const validOn = (spec, day) => asDay(spec.start) <= day && day < asDay(spec.end)
const relations = [
  { id: 2704711, start: '1938-11-21', end: '1939-03-16' },
  { id: 2704709, start: '1939-03-22', end: '1939-10-26' },
  { id: 2704716, start: '1939-10-26', end: '1940-05-18' },
  { id: 2704714, start: '1940-06-01', end: '1940-08-02' },
  { id: 2704713, start: '1940-08-02', end: '1941-04-14' },
  { id: 2692712, start: '1941-08-01', end: '1945-05-08' },
]
const exclusions = [
  { id: 2693083, start: '1939-10-26', end: '1941-08-01', kind: 'General Government' },
  // Relation 2692712 (Reich 1941–1945) contains the General Government's area. The GG ended on
  // 19 January 1945, but its area must still be excluded afterwards: it was liberated, not German.
  { id: 2693084, start: '1941-08-01', end: '1945-01-19', excludeUntil: '1945-05-08', kind: 'General Government' },
  { id: 2704750, start: '1939-03-14', end: '1945-05-08', kind: 'Protectorate of Bohemia and Moravia' },
]
const danzig = { id: 2691478, start: '1920-12-24', end: '1939-09-01' }

const key = (point) => `${point[0]},${point[1]}`
function polygonFromRelation(relation) {
  const segments = relation.members
    .filter((member) => member.type === 'way' && member.role === 'outer')
    .map((member) => {
      if (!Array.isArray(member.geometry) || member.geometry.length < 2) throw new Error(`Incomplete way ${member.ref}`)
      return member.geometry.map((point) => [point.lon, point.lat])
    })
  if (relation.members.some((member) => member.role === 'inner')) {
    throw new Error(`Relation ${relation.id} has inner rings; converter needs hole assignment`)
  }
  const ends = new Map()
  for (let i = 0; i < segments.length; i++) {
    for (const end of [segments[i][0], segments[i].at(-1)]) {
      const k = key(end)
      if (!ends.has(k)) ends.set(k, [])
      ends.get(k).push(i)
    }
  }
  const unused = new Set(segments.map((_, i) => i))
  const rings = []
  while (unused.size) {
    const first = unused.values().next().value
    unused.delete(first)
    const ring = [...segments[first]]
    while (key(ring[0]) !== key(ring.at(-1))) {
      const tail = key(ring.at(-1))
      const next = (ends.get(tail) ?? []).find((i) => unused.has(i))
      if (next === undefined) throw new Error(`Open boundary in relation ${relation.id} at ${tail}`)
      unused.delete(next)
      const segment = segments[next]
      const ordered = key(segment[0]) === tail ? segment : [...segment].reverse()
      ring.push(...ordered.slice(1))
    }
    if (ring.length >= 4) rings.push(ring)
  }
  if (!rings.length) throw new Error(`Relation ${relation.id} has no closed polygon`)
  return { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) }
}

mkdirSync(sourceDir, { recursive: true })
mkdirSync('scripts/data', { recursive: true })
const geometries = new Map()
const provenance = new Map()
for (const spec of [...relations, ...exclusions, danzig]) {
  const path = `${sourceDir}/ohm-reich-${spec.id}.json`
  if (!existsSync(path) || process.argv.includes('--refresh')) {
    let downloaded = false
    for (const suffix of ['out geom;', 'out geom qt;']) {
      const query = `[out:json][timeout:180];relation(${spec.id});${suffix}`
      const response = await fetch('https://overpass-api.openhistoricalmap.org/api/interpreter', {
        method: 'POST', body: new URLSearchParams({ data: query }),
      })
      const body = await response.text()
      if (!response.ok || !body.trimStart().startsWith('{')) continue
      const payload = JSON.parse(body)
      if (!payload.elements?.some((element) => element.type === 'relation' && element.id === spec.id)) continue
      writeFileSync(path, body)
      downloaded = true
      break
    }
    if (!downloaded) throw new Error(`OHM relation ${spec.id} unavailable; no source cache was changed`)
  }
  const source = readFileSync(path)
  const payload = JSON.parse(source.toString('utf8'))
  const relation = payload.elements?.find((element) => element.type === 'relation' && element.id === spec.id)
  if (!relation || relation.tags?.start_date !== spec.start || relation.tags?.end_date !== spec.end) {
    throw new Error(`OHM relation ${spec.id} dates changed; review before rebuilding`)
  }
  const geometry = polygonFromRelation(relation)
  geometries.set(spec.id, geometry)
  provenance.set(spec.id, { id: spec.id, source: `https://www.openhistoricalmap.org/relation/${spec.id}`, sha256: createHash('sha256').update(source).digest('hex') })
  console.log(`OHM ${spec.id}: ${geometry.coordinates.length} closed rings`)
}
const features = []
for (const day of SAMPLE_DAYS) {
  const reich = relations.find((spec) => validOn(spec, day))
  if (!reich) throw new Error(`No OHM Reich relation is valid on ${day}`)
  const excluded = exclusions.filter((spec) => validOn({ ...spec, end: spec.excludeUntil ?? spec.end }, day))
  let coordinates = geometries.get(reich.id).coordinates
  // Danzig was annexed on 1 September 1939; relation 2704709 (from March 1939) predates that.
  if (day >= 19390901 && polygonClipping.intersection(coordinates, geometries.get(danzig.id).coordinates).length === 0) {
    coordinates = polygonClipping.union(coordinates, geometries.get(danzig.id).coordinates)
  }
  for (const spec of excluded) coordinates = polygonClipping.difference(coordinates, geometries.get(spec.id).coordinates)
  if (!coordinates.length) throw new Error(`No German annexation geometry for ${day}`)
  features.push({
    type: 'Feature',
    properties: {
      day, year: Math.floor(day / 10000), kind: 'German annexed/administratively incorporated territory',
      sourceRelations: [provenance.get(reich.id), ...excluded.map((spec) => provenance.get(spec.id))],
      excluded: excluded.map((spec) => spec.kind),
      confidence: 'approximate — OHM relations are marked needs source for boundary lines',
    },
    geometry: { type: 'MultiPolygon', coordinates },
  })
  console.log(`${day}: ${coordinates.length} polygons (relation ${reich.id}) after excluding ${excluded.map((spec) => spec.kind).join(', ') || 'nothing'}`)
}
writeFileSync(outputPath, gzipSync(Buffer.from(JSON.stringify({ type: 'FeatureCollection', license: 'CC0', features }))))
writeFileSync(danzigPath, JSON.stringify({
  type: 'Feature',
  properties: {
    code: 'HDANZIG', name: 'Free City of Danzig', start: 19201224, end: 19390901,
    capital: 'Danzig', lat: 54.35, lng: 18.65, iso: null,
    source: provenance.get(danzig.id),
    confidence: 'approximate — OHM relation is marked needs source for boundary lines',
  },
  geometry: geometries.get(danzig.id),
}))
console.log(`Wrote ${outputPath}`)
