// Build a compact, dated topology for the historical globe.
// Source: ETH Zurich CShapes 2.0, CC BY-NC-SA 4.0 (1886–2019).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import { feature } from 'topojson-client'
import earcut from 'earcut'
import polygonClipping from 'polygon-clipping'

const sourcePath = 'scripts/source/historical/CShapes-2.0.geojson'
const sourceUrl = 'https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson'
const sourceSha256 = '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42'
mkdirSync('scripts/source/historical', { recursive: true })
if (!existsSync(sourcePath)) {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`CShapes download failed: HTTP ${response.status}`)
  writeFileSync(sourcePath, Buffer.from(await response.arrayBuffer()))
}
const source = readFileSync(sourcePath)
const actualHash = createHash('sha256').update(source).digest('hex')
if (actualHash !== sourceSha256) throw new Error(`CShapes checksum changed: ${actualHash}. Review the upstream revision.`)

const raw = JSON.parse(source.toString('utf8'))
const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8'))
const isoQids = JSON.parse(readFileSync('scripts/source/historical/iso-qids.json', 'utf8'))
const flagsData = JSON.parse(readFileSync('scripts/source/historical/flags-data.tab.json', 'utf8'))

const normalized = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const byName = new Map()
for (const c of countries) {
  byName.set(normalized(c.name), c.code)
  byName.set(normalized(c.officialName), c.code)
}
const aliases = {
  Surinam: 'SUR', 'French Guyana': 'GUF', 'German Federal Republic': 'DEU',
  'Macedonia (FYROM/North Macedonia)': 'MKD', 'Bosnia-Herzegovina': 'BIH', Rumania: 'ROU',
  'Belarus (Byelorussia)': 'BLR', "Cote D'Ivoire": 'CIV', 'Burkina Faso (Upper Volta)': 'BFA',
  'Congo, Democratic Republic of (Zaire)': 'COD', 'Tanzania (Tanganyika)': 'TZA',
  'Zimbabwe (Rhodesia)': 'ZWE', 'Swaziland (Eswatini)': 'SWZ',
  'Madagascar (Malagasy)': 'MDG', 'Iran (Persia)': 'IRN',
  'Turkey (Ottoman Empire)': 'TUR', 'Korea, Republic of': 'KOR',
  "Korea, People's Republic of": 'PRK', 'Myanmar (Burma)': 'MMR',
  'Sri Lanka (Ceylon)': 'LKA', 'Cambodia (Kampuchea)': 'KHM',
  'Vietnam, Democratic Republic of': 'VNM', 'East Timor': 'TLS',
}
const qidOverrides = {
  // Different states share a modern ISO successor but must not inherit its historical flag.
  255: 'Q1206012', // German Empire / historical Germany
  265: 'Q16957',   // East Germany
  315: 'Q33946',   // Czechoslovakia
  345: 'Q36704',   // Yugoslavia
  365: 'Q159',     // Russia / Soviet Union: dated manual corrections below
}
const isoByGw = {}
const qidByGw = {}
for (const f of raw.features) {
  const p = f.properties
  const iso = aliases[p.cntry_name] ?? byName.get(normalized(p.cntry_name))
  if (iso) isoByGw[p.gwcode] = iso
  const qid = qidOverrides[p.gwcode] ?? (iso && isoQids[iso])
  if (qid) qidByGw[p.gwcode] = qid
}

const date = (p, prefix) => p[`${prefix}year`] * 10000 + p[`${prefix}month`] * 100 + p[`${prefix}day`]
// CShapes rings are counterclockwise; d3-geo and the existing globe selection expect
// clockwise exterior rings. Reverse every ring, including holes, before building topology.
const signedRingArea = (ring) => ring.reduce((sum, point, index) => {
  const next = ring[(index + 1) % ring.length]
  return sum + point[0] * next[1] - next[0] * point[1]
}, 0) / 2
const polygonArea = (polygons) => polygons.reduce((total, polygon) => total + Math.abs(signedRingArea(polygon[0])), 0)
const globeWinding = (geometry, normalize = false) => ({
  ...geometry,
  coordinates: geometry.type === 'Polygon'
    ? geometry.coordinates.map((ring, index) => normalize && (signedRingArea(ring) < 0) === (index === 0) ? [...ring] : [...ring].reverse())
    : geometry.coordinates.map((polygon) => polygon.map((ring, index) => normalize && (signedRingArea(ring) < 0) === (index === 0) ? [...ring] : [...ring].reverse())),
})
const sourceFeatures = raw.features.map((f) => {
  const p = f.properties
  return {
    type: 'Feature',
    properties: {
      code: `H${p.gwcode}`, name: p.cntry_name, start: date(p, 'gws'), end: date(p, 'gwe'),
      capital: p.capname || null, lat: p.caplat, lng: p.caplong, iso: isoByGw[p.gwcode] ?? null,
    },
    geometry: f.geometry,
  }
})

// CShapes is a state-system dataset, not a complete wartime annexation atlas.
// Correct the 1 January 1939–1945 Reich footprint with CC0 OHM boundaries,
// explicitly subtracting the General Government and Czech Protectorate. This
// is an annexation/administration layer, not a military-control layer.
const annexationPath = 'scripts/data/ww2-annexations.geojson.gz'
if (!existsSync(annexationPath)) throw new Error('Build WWII annexations first: npm run data:ww2')
const annexationSource = readFileSync(annexationPath)
const annexations = JSON.parse(gunzipSync(annexationSource).toString('utf8')).features
const danzigFeature = JSON.parse(readFileSync('scripts/data/ww2-free-city-danzig.geojson', 'utf8'))
if (annexations.length !== 7 || annexations.some((f, i) => f.properties.year !== 1939 + i)) {
  throw new Error('WWII annexation file must contain annual 1939–1945 footprints')
}
const annexationByYear = new Map(annexations.map((f) => [f.properties.year, f.geometry.coordinates]))
const multipolygon = (geometry) => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
const bounds = (coordinates) => {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity
  const visit = (value) => {
    if (typeof value[0] === 'number') {
      west = Math.min(west, value[0]); east = Math.max(east, value[0])
      south = Math.min(south, value[1]); north = Math.max(north, value[1])
    } else for (const child of value) visit(child)
  }
  visit(coordinates)
  return [west, south, east, north]
}
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
const annexationBounds = new Map([...annexationByYear].map(([year, coordinates]) => [year, bounds(coordinates)]))
const wartime = []
for (const sourceFeature of sourceFeatures) {
  const props = sourceFeature.properties
  if (props.end < 19390101 || props.start > 19450101) { wartime.push(sourceFeature); continue }
  const sourcePolygon = multipolygon(sourceFeature.geometry)
  const sourceBounds = bounds(sourcePolygon)
  const relevantYears = [...annexationByYear.keys()].filter((year) => {
    const day = year * 10000 + 101
    return props.start <= day && day <= props.end && overlaps(sourceBounds, annexationBounds.get(year))
  })
  const affected = props.code === 'H255' || relevantYears.some((year) => polygonClipping.intersection(sourcePolygon, annexationByYear.get(year)).length > 0)
  if (!affected) { wartime.push(sourceFeature); continue }
  const append = (geometry, start, end, reconstructed = false) => {
    if (start > end || !geometry?.coordinates?.length) return
    wartime.push({ type: 'Feature', properties: { ...props, start, end }, geometry, reconstructed })
  }
  if (props.start < 19390101) append(sourceFeature.geometry, props.start, Math.min(props.end, 19381231))
  for (let year = 1939; year <= 1945; year++) {
    const day = year * 10000 + 101
    if (props.start > day || props.end < day || props.code === 'H255') continue
    const annexed = annexationByYear.get(year)
    const coordinates = relevantYears.includes(year)
      ? polygonClipping.difference(sourcePolygon, annexed)
      : sourcePolygon
    // Distinct source boundary traces leave microscopic slivers after clipping.
    // Do not invent an "Austria" made up of these numerical leftovers.
    const clean = coordinates.filter((polygon) => Math.abs(signedRingArea(polygon[0])) >= 0.00005)
    if (polygonArea(clean) < polygonArea(sourcePolygon) * 0.03) continue
    append({ type: 'MultiPolygon', coordinates: clean }, day, Math.min(props.end, year * 10000 + 1231), true)
  }
  if (props.end >= 19460101) append(sourceFeature.geometry, Math.max(props.start, 19460101), props.end)
}
wartime.push({ ...danzigFeature, reconstructed: true })
for (const annexation of annexations) {
  const year = annexation.properties.year
  const germany = sourceFeatures.find((f) => f.properties.code === 'H255' && f.properties.start <= year * 10000 + 101 && f.properties.end >= year * 10000 + 101)
  if (!germany) throw new Error(`No CShapes Germany metadata for ${year}`)
  wartime.push({ type: 'Feature', properties: { ...germany.properties, start: year * 10000 + 101, end: Math.min(germany.properties.end, year * 10000 + 1231), source: 'OHM-WWII-annexations' }, geometry: annexation.geometry, reconstructed: true })
}
const features = wartime.map((f, period) => ({
  type: 'Feature', properties: { ...f.properties, period }, geometry: globeWinding(f.geometry, f.reconstructed),
}))

console.log(`CShapes + WWII-annexation periods: ${features.length}; building shared topology...`)
const base = topology({ periods: { type: 'FeatureCollection', features } }, 100000)
const weighted = presimplify(base)
// Keep small bends that become visible at close zoom. CShapes remains the source limit.
const compact = simplify(weighted, quantile(weighted, 0.75))
// The simplified weights are only needed at build time.
compact.arcs = compact.arcs.map((arc) => arc.map(([x, y]) => [x, y]))
writeFileSync('public/data/historical-topology.json', JSON.stringify(compact))

// Triangulate each country-period once. Unwrap rings around the date line before earcut;
// subdivide broad triangles so their flat chords stay above the globe surface.
// The browser copies only active periods into GPU buffers when a year changes.
const decoded = feature(compact, compact.objects.periods)
const lnglat = []
const indices = []
const ranges = []
let vertexMap = new Map()
const vertexIndex = (point) => {
  const key = `${point[0]},${point[1]}`
  let index = vertexMap.get(key)
  if (index == null) {
    index = lnglat.length / 2
    lnglat.push(...point)
    vertexMap.set(key, index)
  }
  return index
}
const appendTriangle = (a, b, c, depth = 0) => {
  const span = Math.max(
    Math.abs(a[0] - b[0]), Math.abs(b[0] - c[0]), Math.abs(c[0] - a[0]),
    Math.abs(a[1] - b[1]), Math.abs(b[1] - c[1]), Math.abs(c[1] - a[1]),
  )
  if (span > 2.5 && depth < 8) {
    const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]
    const ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]
    appendTriangle(a, ab, ca, depth + 1)
    appendTriangle(ab, b, bc, depth + 1)
    appendTriangle(ca, bc, c, depth + 1)
    appendTriangle(ab, bc, ca, depth + 1)
    return
  }
  indices.push(vertexIndex(a), vertexIndex(b), vertexIndex(c))
}
const unwrapRing = (ring, centre = null) => {
  const points = ring.slice(0, -1).map(([lng, lat]) => [lng, lat])
  for (let i = 1; i < points.length; i++) {
    while (points[i][0] - points[i - 1][0] > 180) points[i][0] -= 360
    while (points[i][0] - points[i - 1][0] < -180) points[i][0] += 360
  }
  if (centre != null && points.length) {
    const mean = points.reduce((n, p) => n + p[0], 0) / points.length
    const shift = Math.round((centre - mean) / 360) * 360
    for (const p of points) p[0] += shift
  }
  return points
}
for (const [featureIndex, f] of decoded.features.entries()) {
  if (featureIndex % 100 === 0) console.log(`Triangulating ${featureIndex}/${decoded.features.length}...`)
  vertexMap = new Map()
  const vStart = lnglat.length / 2
  const iStart = indices.length
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const coords of polygons) {
    const outer = unwrapRing(coords[0])
    if (outer.length < 3) continue
    const centre = outer.reduce((n, p) => n + p[0], 0) / outer.length
    const rings = [outer, ...coords.slice(1).map((ring) => unwrapRing(ring, centre))]
    const points = []
    const holes = []
    for (const [ringIndex, ring] of rings.entries()) {
      if (ring.length < 3) continue
      if (ringIndex) holes.push(points.length / 2)
      for (const p of ring) points.push(...p)
    }
    const triangles = earcut(points, holes, 2)
    for (let i = 0; i < triangles.length; i += 3) {
      const p = (index) => [points[index * 2], points[index * 2 + 1]]
      appendTriangle(p(triangles[i]), p(triangles[i + 1]), p(triangles[i + 2]))
    }
  }
  ranges.push([f.properties.period, vStart, lnglat.length / 2 - vStart, iStart, indices.length - iStart])
}
// Keep compact per-period indices when possible, but preserve detailed periods that exceed 16 bits.
const use32BitIndices = ranges.some(([, , vCount]) => vCount > 65536)
const packedIndices = use32BitIndices ? new Uint32Array(indices.length) : new Uint16Array(indices.length)
for (const [, vStart, vCount, iStart, iCount] of ranges) {
  for (let i = iStart; i < iStart + iCount; i++) packedIndices[i] = indices[i] - vStart
}
writeFileSync('public/data/historical-geometry.bin', Buffer.concat([
  Buffer.from(new Float32Array(lnglat).buffer),
  Buffer.from(packedIndices.buffer),
]))
writeFileSync('public/data/historical-geometry.json', JSON.stringify({
  vertices: lnglat.length / 2, indices: indices.length, ranges, indexEncoding: use32BitIndices ? 'local-u32' : 'local-u16',
}))

const flagsByQid = new Map()
for (const [qid, file, start, end] of flagsData.data) {
  if (typeof file !== 'string' || !/\.(svg|png)$/i.test(file) || file.includes('/')) continue
  const list = flagsByQid.get(qid) ?? []
  list.push({ file: file.replace(/\uFFFD/g, '–'), start: start || null, end: end || null })
  flagsByQid.set(qid, list)
}
const flagsByGw = {}
for (const [gw, qid] of Object.entries(qidByGw)) {
  const entries = flagsByQid.get(qid)
  if (entries?.length) flagsByGw[gw] = entries
}
const dated = (file, start, end = null) => ({ file, start, end })
// CShapes uses one country code across regime changes. Keep the dated flag record
// tied to the historical state instead of inheriting a present-day successor.
flagsByGw[260] = [dated('Flag of Germany.svg', '1949-05-23')]
flagsByGw[265] = [
  dated('Flag of Germany.svg', '1949-10-07', '1959-10-01'),
  dated('Flag of East Germany.svg', '1959-10-01', '1990-10-03'),
]
flagsByGw[315] = [dated('Flag of Czechoslovakia.svg', '1920-03-30', '1993-01-01')]
flagsByGw[345] = [
  dated('Flag of Yugoslavia (1918–1941).svg', '1918-12-01', '1946-01-31'),
  dated('Flag of Yugoslavia (1946–1992).svg', '1946-01-31', '1992-04-27'),
  dated('Flag of Yugoslavia (1992–2003).svg', '1992-04-27', '2003-02-04'),
]
flagsByGw[365] = [
  dated('Flag of Russia.svg', '1896-05-11', '1918-01-01'),
  dated('Flag of the Russian Soviet Federative Socialist Republic (1918–1925).svg', '1918-01-01', '1922-12-30'),
  dated('Flag of the Soviet Union.svg', '1922-12-30', '1991-12-26'),
  dated('Flag of Russia (1991–1993).svg', '1991-12-26', '1993-12-11'),
  dated('Flag of Russia.svg', '1993-12-11'),
]
writeFileSync('public/data/historical-flags.json', JSON.stringify(flagsByGw))
console.log(`Topology: ${Math.round(Buffer.byteLength(JSON.stringify(compact)) / 1024)} KB; geometry: ${Math.round((lnglat.length * 4 + indices.length * 2) / 1024)} KB; flag timelines: ${Object.keys(flagsByGw).length}`)
const { execFileSync } = await import('node:child_process')
execFileSync(process.execPath, ['scripts/verify-history.mjs', '--write-manifest'], { stdio: 'inherit' })
