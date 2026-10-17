import { readFileSync, statSync } from 'node:fs'

const root = 'public/data/map-detail'
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'))
const required = ['borders', 'admin1', 'rivers', 'lakes']
if (manifest.cols !== 12 || manifest.rows !== 6 || manifest.step !== 30) throw new Error('Unexpected vector tile grid')
let bytes = 0
let tiles = 0
for (const kind of required) {
  const entries = Object.entries(manifest.kinds[kind] ?? {})
  if (!entries.length) throw new Error(`Missing ${kind} tile family`)
  for (const [key, segments] of entries) {
    const [x, y] = key.split('-').map(Number)
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 12 || y < 0 || y >= 6) throw new Error(`Invalid tile key: ${key}`)
    const size = statSync(`${root}/${kind}/${key}.bin`).size
    if (size !== segments * 8) throw new Error(`Invalid ${kind}/${key}.bin: ${size} bytes for ${segments} segments`)
    bytes += size
    tiles++
  }
}
if (bytes > 10_000_000) throw new Error(`Vector assets exceed 10 MB (${bytes})`)
const places = JSON.parse(readFileSync(`${root}/places.json`, 'utf8'))
if (places.length < 500 || places.some((place) => !place.name || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180)) throw new Error('Invalid place labels')
let imagery = 0
for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
  const size = statSync(`public/textures/earth-detail/${x}-${y}.webp`).size
  if (size < 1000 || size > 500000) throw new Error(`Invalid image tile ${x}-${y}: ${size} bytes`)
  imagery += size
}
if (imagery > 12_000_000) throw new Error(`Image tiles exceed 12 MB (${imagery})`)
console.log(`Map detail verified: ${tiles} vector tiles (${(bytes / 1048576).toFixed(2)} MiB), 128 image tiles (${(imagery / 1048576).toFixed(2)} MiB), ${places.length} places`)
