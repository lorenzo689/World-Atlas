// VIINA 2.0 (ODbL) settlement-control boundary. This is an approximation, not a tactical frontline.
// Inputs: https://github.com/zhukovyuri/VIINA (annual control_latest ZIP, gn_UA_tess.geojson)
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Unzip, UnzipInflate } from 'fflate'
import { topology } from 'topojson-server'
import { mesh, merge } from 'topojson-client'
import { presimplify, simplify } from 'topojson-simplify'

const root = 'scripts/source/conflicts/'
const year = new Date().getUTCFullYear()
const archive = `${root}control_latest_${year}.zip`
const tessellation = `${root}gn_UA_tess.geojson`
const output = 'public/data/conflict-lines.json'
const inputs = [
  [archive, `https://media.githubusercontent.com/media/zhukovyuri/VIINA/main/Data/control_latest_${year}.zip`],
  [tessellation, 'https://raw.githubusercontent.com/zhukovyuri/VIINA/main/Data/gn_UA_tess.geojson'],
]
mkdirSync(root, { recursive: true })
for (const [path, url] of inputs) {
  if (existsSync(path) && !process.argv.includes('--refresh')) continue
  const response = await fetch(url)
  if (!response.ok) throw new Error(`VIINA download failed (${path}): HTTP ${response.status}`)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

const cutoff = Number(new Date().toISOString().slice(0, 10).replaceAll('-', ''))
const latest = new Map()
let csvDate = 0
let pending = ''
let rows = 0
let header = false
const consumeLine = (line) => {
  if (!header) { header = true; if (!line.startsWith('geonameid,date,status_wiki,status_boost,')) throw new Error('Unexpected VIINA CSV schema'); return }
  if (!line) return
  const fields = line.split(',')
  const id = Number(fields[0])
  const day = Number(fields[1])
  const status = fields[3]
  if (day > cutoff || !Number.isInteger(id) || !Number.isInteger(day)) return
  if (!['UA', 'RU', 'CONTESTED'].includes(status)) return
  const prior = latest.get(id)
  if (!prior || day >= prior.day) latest.set(id, { day, status })
  csvDate = Math.max(csvDate, day)
  rows++
}

await new Promise((resolve, reject) => {
  const decoder = new TextDecoder()
  let found = false
  let finished = false
  const unzip = new Unzip((file) => {
    if (file.name !== `control_latest_${year}.csv`) return
    found = true
    file.ondata = (error, chunk, final) => {
      if (error) { reject(error); return }
      const text = pending + decoder.decode(chunk, { stream: !final })
      const lines = text.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) consumeLine(line.replace(/\r$/, ''))
      if (final) {
        if (pending) consumeLine(pending.replace(/\r$/, ''))
        finished = true
        resolve()
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  createReadStream(archive).on('data', (chunk) => unzip.push(chunk)).on('end', () => {
    unzip.push(new Uint8Array(), true)
    if (!found || !finished) reject(new Error('VIINA CSV missing or incomplete'))
  }).on('error', reject)
})
console.log(`Read ${rows} status observations; latest day ${csvDate}`)

const source = JSON.parse(readFileSync(tessellation, 'utf8'))
const cells = source.features.flatMap((feature) => {
  const id = Number(feature.properties?.geonameid)
  const entry = latest.get(id)
  return entry && feature.geometry ? [{ type: 'Feature', properties: { status: entry.status }, geometry: feature.geometry }] : []
})
console.log(`Building topology for ${cells.length} settlement cells...`)
const topo = topology({ cells: { type: 'FeatureCollection', features: cells } }, 1e6)
const boundary = mesh(topo, topo.objects.cells, (a, b) => a !== b && a.properties.status !== b.properties.status)
const lines = boundary.coordinates
  .filter((line) => line.length > 1)
  .map((line) => line.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]))
const date = String(csvDate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
const result = {
  schemaVersion: 1,
  asOf: date,
  conflictId: 'ukraine',
  type: 'estimated-control-boundary',
  source: 'VIINA 2.0, status_boost (news reports and Wikipedia), GeoNames settlement tessellation',
  sourceUrl: 'https://github.com/zhukovyuri/VIINA',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  sourceSha256: Object.fromEntries(inputs.map(([path]) => [path.split('/').at(-1), createHash('sha256').update(readFileSync(path)).digest('hex')])),
  caveat: 'Approximate boundary between settlement-control categories; not a surveyed or live military frontline.',
  lines,
}
writeFileSync(output, JSON.stringify(result))
console.log(`Wrote ${output}: ${lines.length} paths, ${(JSON.stringify(result).length / 1024).toFixed(0)} KiB`)

// Keep controller identity in a separate area product; linework alone cannot encode either side.
const simplified = simplify(presimplify(topo), 0.000002)
const actors = {
  RU: { actor: { de: 'Russische Streitkräfte', en: 'Russian forces' }, color: '#fb7185', kind: 'occupation' },
  UA: { actor: { de: 'Ukrainische Streitkräfte', en: 'Ukrainian forces' }, color: '#38bdf8', kind: 'control' },
  CONTESTED: { actor: { de: 'Kontrolle umstritten', en: 'Contested control' }, color: '#fbbf24', kind: 'contested' },
}
const features = Object.entries(actors).flatMap(([actorId, actor]) => {
  const geometries = simplified.objects.cells.geometries.filter((cell) => cell.properties.status === actorId)
  if (!geometries.length) return []
  return [{ id: `ua-${actorId}`, actorId, ...actor, title: { de: 'Ukraine · geschätzte Siedlungskontrolle', en: 'Ukraine · estimated settlement control' }, precision: 'settlement-estimate', source: { title: 'VIINA 2.0 · status_boost / GeoNames', url: result.sourceUrl, date, license: result.license, licenseUrl: result.licenseUrl }, geometry: merge(simplified, geometries) }]
})
writeFileSync('public/data/territories-today.json', JSON.stringify({ schemaVersion: 1, snapshots: [{ id: `ukraine-${date}`, scenario: 'today', year: Number(date.slice(0, 4)), date, coverage: { de: 'Ukraine: Siedlungszellen mit dokumentierter Kontrolle. Keine weltweite Vollabdeckung; unbekannte Zellen bleiben frei.', en: 'Ukraine: settlement cells with documented control. Not worldwide coverage; unknown cells remain unshaded.' }, features }], sourceSha256: result.sourceSha256 }))
console.log('Wrote territories-today.json with controller polygons and independent source date')
