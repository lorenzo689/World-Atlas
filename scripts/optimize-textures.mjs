// Converts the source textures in scripts/source/textures into the web-optimised WebP files in
// public/textures (smaller downloads, smaller GPU footprint). Run: node scripts/optimize-textures.mjs
import { mkdirSync, statSync } from 'node:fs'
import sharp from 'sharp'

const SRC = 'scripts/source/textures'
const OUT = 'public/textures'
mkdirSync(OUT, { recursive: true })

const jobs = [
  // colour map: full res for desktop, 2k for phones / low-memory devices
  { from: 'earth-blue-marble.jpg', to: 'earth-blue-marble.webp', width: 4096, quality: 80 },
  { from: 'earth-blue-marble.jpg', to: 'earth-blue-marble-2k.webp', width: 2048, quality: 80 },
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
