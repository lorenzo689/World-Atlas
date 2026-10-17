// Converts the source textures in scripts/source/textures into the web-optimised WebP files in
// public/textures (smaller downloads, smaller GPU footprint). Run: node scripts/optimize-textures.mjs
import { mkdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const SRC = 'scripts/source/textures'
const OUT = 'public/textures'
mkdirSync(OUT, { recursive: true })
const HIRES = `${SRC}/earth-blue-marble-hires.jpg`
const NASA_URL = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x21600x10800.jpg'
const NASA_SHA256 = '5dbb5f101c3336f260506dcd574aaba4d5e9af2ff8533161367098affea86408'
if (!existsSync(HIRES)) {
  const response = await fetch(NASA_URL)
  if (!response.ok) throw new Error(`NASA texture: HTTP ${response.status}`)
  writeFileSync(HIRES, Buffer.from(await response.arrayBuffer()))
}
if (createHash('sha256').update(readFileSync(HIRES)).digest('hex') !== NASA_SHA256) throw new Error('NASA source checksum mismatch')

const jobs = [
  // colour map: full res for desktop, 2k for phones / low-memory devices
  { from: 'earth-blue-marble-hires.jpg', to: 'earth-blue-marble.webp', width: 4096, quality: 80 },
  { from: 'earth-blue-marble-hires.jpg', to: 'earth-blue-marble-2k.webp', width: 2048, quality: 80 },
  // single-channel maps
  { from: 'earth-topology.png', to: 'earth-topology.webp', width: 2048, quality: 75, grey: true },
  { from: 'earth-water.png', to: 'earth-water.webp', width: 1600, quality: 75, grey: true },
  // background: heavy blur-free stars compress well, and 2k is plenty behind the globe
  { from: 'night-sky.png', to: 'night-sky.webp', width: 2048, quality: 60 },
]

for (const j of jobs) {
  let img = sharp(`${SRC}/${j.from}`).resize({ width: j.width })
  if (j.grey) img = img.greyscale()
  await img.webp({ quality: j.quality, effort: 5 }).toFile(`${OUT}/${j.to}`)
  const kb = Math.round(statSync(`${OUT}/${j.to}`).size / 1024)
  console.log(`${j.to.padEnd(30)} ${kb} KB`)
}

// A 16x8 equirectangular pyramid. The globe requests only tiles near the camera at close zoom;
// the 4k global texture remains the immediate fallback while tiles load.
mkdirSync(`${OUT}/earth-detail`, { recursive: true })
const columns = 16
const rows = 8
const sourceWidth = 21600 / columns
const sourceHeight = 10800 / rows
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < columns; x++) {
    const path = `${OUT}/earth-detail/${x}-${y}.webp`
    await sharp(HIRES)
      .extract({ left: x * sourceWidth, top: y * sourceHeight, width: sourceWidth, height: sourceHeight })
      .resize(1024, 1024)
      .webp({ quality: 82, effort: 4 })
      .toFile(path)
  }
  console.log(`detail image row ${y + 1}/${rows}`)
}
