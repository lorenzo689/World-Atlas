import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'
import { geoContains } from 'd3-geo'

const data = 'public/data/'
const files = ['historical-topology.json', 'historical-geometry.json', 'historical-geometry.bin', 'historical-flags.json']
const bytes = Object.fromEntries(files.map((name) => [name, readFileSync(data + name)]))
const json = (name) => JSON.parse(bytes[name].toString('utf8'))
const topo = json(files[0])
const meta = json(files[1])
const flags = json(files[3])
const periods = topo.objects.periods.geometries
const errors = []
const check = (condition, message) => { if (!condition) errors.push(message) }
const byCode = new Map()
const byPeriod = new Map(periods.map((p) => [p.properties.period, p]))

check(meta.ranges.length === periods.length, 'Geometry range count differs from topology periods')
check(['local-u16', 'local-u32'].includes(meta.indexEncoding), 'Unexpected index encoding')
const indexBytes = meta.indexEncoding === 'local-u32' ? 4 : 2
check(bytes[files[2]].length === meta.vertices * 8 + meta.indices * indexBytes, 'Binary length differs from metadata')
const buffer = bytes[files[2]]
for (const p of periods) {
  const x = p.properties
  check(x.start <= x.end && x.start >= 18860101 && x.end <= 20191231, `Invalid period dates: ${x.period}`)
  const list = byCode.get(x.code) ?? []
  list.push(x)
  byCode.set(x.code, list)
}
for (const [code, list] of byCode) {
  list.sort((a, b) => a.start - b.start)
  for (let i = 1; i < list.length; i++) check(list[i - 1].end < list[i].start, `Overlapping periods for ${code}`)
}
for (let year = 1886; year <= 2019; year++) {
  const day = year * 10000 + 101
  check(periods.some((p) => p.properties.start <= day && day <= p.properties.end), `No active geography for ${year}`)
}
let lastV = 0, lastI = 0
for (const [id, vStart, vCount, iStart, iCount] of meta.ranges) {
  check(byPeriod.has(id), `Unknown geometry period ${id}`)
  check(vStart === lastV && iStart === lastI, `Non-contiguous geometry period ${id}`)
  check((indexBytes === 4 || vCount <= 65536) && vCount >= 0 && iCount >= 0 && iCount % 3 === 0, `Invalid range ${id}`)
  for (let i = iStart; i < iStart + iCount; i++) {
    const index = indexBytes === 4 ? buffer.readUInt32LE(meta.vertices * 8 + i * 4) : buffer.readUInt16LE(meta.vertices * 8 + i * 2)
    if (index >= vCount) { errors.push(`Index out of range in ${id}`); break }
  }
  lastV += vCount
  lastI += iCount
}
check(lastV === meta.vertices && lastI === meta.indices, 'Geometry range totals differ from metadata')
for (const [code, list] of Object.entries(flags)) {
  for (const flag of list) check(typeof flag.file === 'string' && flag.file.length > 0 && (!flag.start || /^\d{4}-\d{2}-\d{2}$/.test(flag.start)) && (!flag.end || /^\d{4}-\d{2}-\d{2}$/.test(flag.end)), `Invalid flag timeline ${code}`)
}
const decoded = feature(topo, topo.objects.periods).features
const contains = (code, year, point) => decoded.some((f) => f.properties.code === code && f.properties.start <= year * 10000 + 101 && f.properties.end >= year * 10000 + 101 && geoContains(f, point))
for (const [name, point] of Object.entries({ Berlin: [13.4, 52.52], Vienna: [16.37, 48.21], Liberec: [15.06, 50.77] })) {
  check(contains('H255', 1939, point), `${name} absent from Germany on 1 January 1939`)
}
check(contains('HDANZIG', 1939, [18.65, 54.35]), 'Free City of Danzig missing in 1939')
check(!contains('H255', 1939, [18.65, 54.35]), 'Danzig incorrectly annexed on 1 January 1939')
for (const [name, point] of Object.entries({ Berlin: [13.4, 52.52], Vienna: [16.37, 48.21], Liberec: [15.06, 50.77], Danzig: [18.65, 54.35], Memel: [21.13, 55.70], Poznan: [16.93, 52.41] })) {
  check(contains('H255', 1940, point), `${name} absent from Germany on 1 January 1940`)
}
check(!contains('H255', 1940, [21.01, 52.23]), 'Warsaw/General Government incorrectly annexed in 1940')
check(!contains('H255', 1940, [14.42, 50.09]), 'Prague/Protectorate incorrectly annexed in 1940')
check(!contains('H305', 1940, [16.37, 48.21]), 'Austria incorrectly remains a separate state in 1940')
check(!contains('H290', 1940, [16.93, 52.41]), 'Poznan incorrectly remains Polish in 1940')
if (errors.length) throw new Error(`History validation failed:\n${errors.slice(0, 30).join('\n')}`)

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const ww2Files = ['ww2-annexations.geojson.gz', 'ww2-free-city-danzig.geojson']
const ww2Bytes = Object.fromEntries(ww2Files.map((name) => [name, readFileSync('scripts/data/' + name)]))
const manifest = {
  schemaVersion: 1,
  snapshotConvention: '1 January, inclusive source periods',
  source: { title: 'CShapes 2.0', url: 'https://icr.ethz.ch/data/cshapes/', license: 'CC BY-NC-SA 4.0', sha256: '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42' },
  ww2Source: { title: 'OpenHistoricalMap dated boundary relations', url: 'https://www.openhistoricalmap.org/', license: 'CC0', method: 'German administrative footprint minus General Government and Protectorate; 1 January yearly snapshots; approximate OHM geometry', relations: [2704711, 2704716, 2704713, 2692712, 2693083, 2693084, 2704750, 2691478], files: Object.fromEntries(ww2Files.map((name) => [name, { bytes: ww2Bytes[name].length, sha256: sha256(ww2Bytes[name]) }])) },
  flags: { source: 'https://commons.wikimedia.org/wiki/Data:FlagsData.tab', filesAreHotlinked: true },
  years: [1886, 2019],
  periods: periods.length,
  geometry: { vertices: meta.vertices, indices: meta.indices, indexEncoding: meta.indexEncoding },
  files: Object.fromEntries(files.map((name) => [name, { bytes: bytes[name].length, sha256: sha256(bytes[name]) }])),
}
if (process.argv.includes('--write-manifest')) writeFileSync(data + 'historical-manifest.json', JSON.stringify(manifest, null, 2) + '\n')
else check(JSON.stringify(JSON.parse(readFileSync(data + 'historical-manifest.json', 'utf8'))) === JSON.stringify(manifest), 'Historical manifest differs from generated files')
if (errors.length) throw new Error(errors.join('\n'))
console.log(`Historical data verified: ${periods.length} periods, ${byCode.size} states, 134 annual snapshots, ${Math.round(buffer.length / 1048576)} MiB geometry`)
