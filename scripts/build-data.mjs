// Builds the static data snapshot used by the app:
//  - public/data/countries.json   (mledoze/countries metadata snapshot, see scripts/source)
//  - public/flags/*.svg           (flag-icons, keyed by ISO alpha-3)
//  - public/data/boundaries.json  (Natural Earth 1:50m boundaries via world-atlas, keyed by ISO alpha-3)
//  - public/sitemap.xml
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { feature } from 'topojson-client'

const require = createRequire(import.meta.url)
const src = JSON.parse(readFileSync('scripts/source/countries.json', 'utf8'))

const countries = src
  .map((c) => ({
    code: c.cca3,
    code2: c.cca2,
    numeric: c.ccn3 || null,
    name: c.name.common,
    officialName: c.name.official,
    capital: c.capital ?? [],
    region: c.region,
    subregion: c.subregion ?? null,
    independent: c.independent ?? false,
    unMember: c.unMember ?? false,
    landlocked: c.landlocked ?? false,
    area: c.area ?? null,
    latlng: c.latlng ?? null,
    borders: c.borders ?? [],
    currencies: Object.entries(c.currencies ?? {}).map(([code, v]) => ({ code, name: v.name, symbol: v.symbol ?? '' })),
    languages: Object.values(c.languages ?? {}),
    flagEmoji: c.flag ?? '',
    tld: c.tld ?? [],
    callingCode: c.idd?.root ? c.idd.root + (c.idd.suffixes?.length === 1 ? c.idd.suffixes[0] : '') : null,
    demonym: c.demonyms?.eng?.m ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

// flags (flag-icons, 4:3 SVG) keyed by ISO alpha-3
mkdirSync('public/flags', { recursive: true })
let flagCount = 0
for (const c of countries) {
  const from = `node_modules/flag-icons/flags/4x3/${c.code2.toLowerCase()}.svg`
  if (existsSync(from)) { copyFileSync(from, `public/flags/${c.code}.svg`); flagCount++ }
}
console.log('flags:', flagCount)

mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/countries.json', JSON.stringify(countries))
console.log('countries:', countries.length)

// --- boundaries -------------------------------------------------------------
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))
const fc = feature(topo, topo.objects.countries)
const byNumeric = new Map(countries.filter((c) => c.numeric).map((c) => [String(c.numeric).padStart(3, '0'), c]))
const byName = new Map(countries.map((c) => [c.name.toLowerCase(), c]))
const nameAliases = { kosovo: 'XKX', 'n. cyprus': 'CYP', somaliland: null }

const round = (n) => Math.round(n * 100) / 100
const roundCoords = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(roundCoords))

const features = []
const unmatched = []
for (const f of fc.features) {
  const id = f.id != null ? String(f.id).padStart(3, '0') : null
  let c = id ? byNumeric.get(id) : undefined
  if (!c) c = byName.get((f.properties?.name ?? '').toLowerCase())
  if (!c) {
    const alias = nameAliases[(f.properties?.name ?? '').toLowerCase()]
    if (alias) c = countries.find((x) => x.code === alias)
  }
  if (!c) { unmatched.push(f.properties?.name); continue }
  features.push({
    type: 'Feature',
    properties: { code: c.code, name: c.name },
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  })
}
// Merge parts that map onto the same country (e.g. Northern Cyprus into Cyprus) into a MultiPolygon.
const merge = new Map()
for (const f of features) {
  const prev = merge.get(f.properties.code)
  if (!prev) { merge.set(f.properties.code, f); continue }
  const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
  prev.geometry = { type: 'MultiPolygon', coordinates: [...polys(prev.geometry), ...polys(f.geometry)] }
}
const out = { type: 'FeatureCollection', features: [...merge.values()] }
writeFileSync('public/data/boundaries.json', JSON.stringify(out))
console.log('boundaries:', out.features.length, 'unmatched:', unmatched)
console.log('countries without boundary:', countries.filter((c) => !merge.has(c.code)).map((c) => c.name).join(', '))

// --- sitemap ----------------------------------------------------------------
const urls = ['/', ...countries.map((c) => `/countries/${c.code}`)]
writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>https://world-explorer.example${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`,
)
writeFileSync('public/robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://world-explorer.example/sitemap.xml\n')
