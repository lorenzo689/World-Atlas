import { writeFileSync, mkdirSync } from 'node:fs'
import { PbfReader, PbfWriter } from 'pbf'
const source = await (await fetch('https://tiles.openfreemap.org/planet')).json()
const url = source.tiles[0].replace('{z}', '6').replace('{x}', '34').replace('{y}', '21')
const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
const writer = new PbfWriter()
new PbfReader(bytes).readFields((tag, _, pbf) => {
  if (tag !== 3) return
  const data = pbf.readBytes()
  let name = ''
  new PbfReader(data).readFields((t, _, p) => { if (t === 1) name = p.readString() }, null)
  if (['boundary', 'water'].includes(name)) writer.writeBytesField(3, data)
}, null)
mkdirSync('src/lib/__tests__/fixtures', { recursive: true })
const out = writer.finish()
writeFileSync('src/lib/__tests__/fixtures/osm-6-34-21.pbf', out)
writeFileSync('src/lib/__tests__/fixtures/README.md', `# Border fixture\n\nBoundary and water layers extracted without geometry changes from ${url}.\n\nOpenStreetMap contributors (ODbL), OpenMapTiles schema, hosted by OpenFreeMap. Retrieved 2026-10-21. Test input is pinned so CI needs no external tile service.\n`)
console.log(url, bytes.length, out.length)
