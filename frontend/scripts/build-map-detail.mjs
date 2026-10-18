// Build zoom-only line tiles from Natural Earth. The source is pinned so rebuilds are repeatable.
// npm run data:detail
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mesh } from 'topojson-client'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const REV = 'ca96624a56bd078437bca8184e78163e5039ad19'
const SOURCE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${REV}/geojson`
const CACHE = 'scripts/source/detail'
const HASHES = {
  ne_10m_admin_1_states_provinces_lines: '1a1f30ccaaf4cc9c4bde34266f0b8cbb955d3a4cf254b756912255f2ec7c75b6',
  ne_10m_rivers_lake_centerlines_scale_rank: '65dca1bd1729a347dda0837f41b5d152252e33abd2d7ff3370a0539c33bdf89b',
  ne_10m_lakes: '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9',
  ne_10m_populated_places_simple: 'fd3fa867a320cbd5c5b6bb5bc550afeec2939fb2cef688e508007282a55ac42f',
  ne_10m_roads: '66a0c7b438e92fd124822cc5921cfa11042f48c294ade5e0f03f2c6640fd0248',
}
const OUT = 'public/data/map-detail'
const COLS = 12
const ROWS = 6
const STEP = 30
mkdirSync(CACHE, { recursive: true })
mkdirSync(OUT, { recursive: true })

async function source(name) {
  const path = `${CACHE}/${name}.geojson`
  if (!existsSync(path) || !readFileSync(path).length) {
    const response = await fetch(`${SOURCE}/${name}.geojson`)
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  }
  const bytes = readFileSync(path)
  if (createHash('sha256').update(bytes).digest('hex') !== HASHES[name]) throw new Error(`${name}: source checksum mismatch`)
  return JSON.parse(bytes.toString('utf8'))
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const tileOf = ([lng, lat]) => [clamp(Math.floor((lng + 180) / STEP), 0, COLS - 1), clamp(Math.floor((90 - lat) / STEP), 0, ROWS - 1)]
const bins = new Map()
function addSegment(kind, a, b) {
  if (Math.abs(a[0] - b[0]) > 180) return // a dateline seam, not a line across the planet
  if (a[0] === b[0] && a[1] === b[1]) return
  const [ax, ay] = tileOf(a)
  const [bx, by] = tileOf(b)
  for (const [x, y] of new Map([[`${ax}-${ay}`, [ax, ay]], [`${bx}-${by}`, [bx, by]]]).values()) {
    const key = `${kind}/${x}-${y}`
    const bin = bins.get(key) ?? []
    const west = -180 + x * STEP
    const north = 90 - y * STEP
    const values = [a[0] - west, north - a[1], b[0] - west, north - b[1]]
    // A segment spanning more than a tile is an invalid input for this compact encoding.
    if (values.some((v) => v < -32.7 || v > 32.7)) continue
    bin.push(...values.map((v) => Math.round(v * 1000)))
    bins.set(key, bin)
  }
}
function lines(kind, coords) {
  for (const line of coords) for (let i = 1; i < line.length; i++) addSegment(kind, line[i - 1], line[i])
}
function geometryLines(g) {
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates]
  if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates
  if (g.type === 'MultiPolygon') return g.coordinates.flat()
  return []
}

const topology = JSON.parse(readFileSync(require.resolve('world-atlas/countries-10m.json'), 'utf8'))
lines('borders', mesh(topology, topology.objects.countries).coordinates)
for (const [name, kind, maxRank] of [
  ['ne_10m_admin_1_states_provinces_lines', 'admin1', 5],
  ['ne_10m_rivers_lake_centerlines_scale_rank', 'rivers', 6],
  ['ne_10m_lakes', 'lakes', 6],
  ['ne_10m_roads', 'roads', 5],
]) {
  const data = await source(name)
  for (const f of data.features) {
    const rank = Number(f.properties?.SCALERANK ?? f.properties?.scalerank ?? 99)
    if (rank <= maxRank) lines(kind, geometryLines(f.geometry))
  }
}

const places = (await source('ne_10m_populated_places_simple')).features
  .filter((f) => f.geometry?.type === 'Point' && f.properties?.name && (f.properties.adm0cap === 1 || f.properties.pop_max >= 50000))
  .map((f) => ({ name: f.properties.name, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], population: f.properties.pop_max ?? 0, capital: f.properties.adm0cap === 1 }))
  .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population)
writeFileSync(`${OUT}/places.json`, JSON.stringify(places))

const manifest = { source: { borders: 'world-atlas@2 Natural Earth 1:10m', detail: `${SOURCE}/`, sha256: HASHES, license: 'Natural Earth public domain' }, cols: COLS, rows: ROWS, step: STEP, kinds: {} }
for (const [key, numbers] of bins) {
  const [kind, tile] = key.split('/')
  mkdirSync(`${OUT}/${kind}`, { recursive: true })
  const array = Int16Array.from(numbers)
  writeFileSync(`${OUT}/${kind}/${tile}.bin`, Buffer.from(array.buffer))
  ;(manifest.kinds[kind] ??= {})[tile] = array.length / 4
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest))
console.log(Object.fromEntries(Object.entries(manifest.kinds).map(([key, value]) => [key, Object.values(value).reduce((a, b) => a + b, 0)])))
console.log(`Places: ${places.length}`)
