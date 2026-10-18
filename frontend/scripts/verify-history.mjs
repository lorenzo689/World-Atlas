import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

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
check(meta.indexEncoding === 'local-u16', 'Expected local-u16 index encoding')
check(bytes[files[2]].length === meta.vertices * 8 + meta.indices * 2, 'Binary length differs from metadata')
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
  check(vCount <= 65536 && vCount >= 0 && iCount >= 0 && iCount % 3 === 0, `Invalid range ${id}`)
  for (let i = iStart; i < iStart + iCount; i++) {
    if (buffer.readUInt16LE(meta.vertices * 8 + i * 2) >= vCount) { errors.push(`Index out of range in ${id}`); break }
  }
  lastV += vCount
  lastI += iCount
}
check(lastV === meta.vertices && lastI === meta.indices, 'Geometry range totals differ from metadata')
for (const [code, list] of Object.entries(flags)) {
  for (const flag of list) check(typeof flag.file === 'string' && flag.file.length > 0 && (!flag.start || /^\d{4}-\d{2}-\d{2}$/.test(flag.start)) && (!flag.end || /^\d{4}-\d{2}-\d{2}$/.test(flag.end)), `Invalid flag timeline ${code}`)
}
if (errors.length) throw new Error(`History validation failed:\n${errors.slice(0, 30).join('\n')}`)

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const manifest = {
  schemaVersion: 1,
  snapshotConvention: '1 January, inclusive source periods',
  source: { title: 'CShapes 2.0', url: 'https://icr.ethz.ch/data/cshapes/', license: 'CC BY-NC-SA 4.0', sha256: '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42' },
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
