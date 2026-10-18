// Renders the PWA icons from public/favicon.svg:  node scripts/build-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/favicon.svg')
mkdirSync('public/icons', { recursive: true })

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
}
// maskable icons need a safe zone: the logo sits in the inner 60 % on a solid background
const inner = await sharp(svg, { density: 384 }).resize(310, 310).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0A101A' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('public/icons/icon-maskable-512.png')
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')
console.log('icons written to public/icons')
