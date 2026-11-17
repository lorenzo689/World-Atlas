// Real star field for the globe background: the Yale Bright Star Catalogue, 5th revised edition
// (Hoffleit & Warren 1991; all ~9,100 stars visible to the naked eye, to about magnitude 6.5).
// Distributed freely by the Harvard–Smithsonian TDC and NASA ADC; positions are J2000.
//
//   npm run data:stars   -> public/data/stars.bin (Float32: right ascension rad, declination rad,
//                           visual magnitude, B–V colour index; 4 values per star)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const URL = 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz'
const CACHE = 'scripts/source/stars/bsc5.dat.gz'
const SHA256 = '0471ced07fc241e625613baa689b2fa5f4b59fd733f731003e57d2d436036cdb'

mkdirSync('scripts/source/stars', { recursive: true })
if (!existsSync(CACHE)) {
  const response = await fetch(URL, { headers: { 'User-Agent': 'WorldExplorerBuild/1.0 (educational project)' } })
  if (!response.ok) throw new Error(`BSC5 download failed: ${response.status}`)
  writeFileSync(CACHE, Buffer.from(await response.arrayBuffer()))
}
const raw = readFileSync(CACHE)
const sha = createHash('sha256').update(raw).digest('hex')
if (sha !== SHA256) throw new Error(`BSC5 changed (sha256 ${sha}); review before rebuilding`)

// Fixed-width columns from the catalogue ReadMe (1-based, inclusive).
const col = (line, a, b) => line.slice(a - 1, b).trim()
const stars = []
for (const line of gunzipSync(raw).toString('latin1').split('\n')) {
  const raH = col(line, 76, 77)
  if (!raH) continue // a few entries (novae, extragalactic objects) have no position
  const ra = ((Number(raH) + Number(col(line, 78, 79)) / 60 + Number(col(line, 80, 83)) / 3600) * 15 * Math.PI) / 180
  const sign = col(line, 84, 84) === '-' ? -1 : 1
  const dec = (sign * (Number(col(line, 85, 86)) + Number(col(line, 87, 88)) / 60 + Number(col(line, 89, 90)) / 3600) * Math.PI) / 180
  const mag = Number(col(line, 103, 107))
  const bv = col(line, 110, 114)
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue
  stars.push([ra, dec, mag, bv === '' ? 0.6 : Number(bv)])
}
stars.sort((a, b) => a[2] - b[2]) // brightest first
writeFileSync('public/data/stars.bin', Buffer.from(new Float32Array(stars.flat()).buffer))
console.log(`stars: ${stars.length} (brightest V=${stars[0][2]}), sha256 ${sha}`)
