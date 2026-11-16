// Builds the static data snapshot used by the app:
//  - public/data/countries.json   (mledoze/countries metadata snapshot, see scripts/source)
//  - public/flags/*.svg           (flag-icons, keyed by ISO alpha-3)
//  - public/data/boundaries.json  (Natural Earth 1:50m boundaries via world-atlas, keyed by ISO alpha-3)
//  - public/sitemap.xml
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { presimplify, simplify, quantile } from 'topojson-simplify'
import { feature } from 'topojson-client'
import { geoCentroid, geoDistance } from 'd3-geo'

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
// Shipped as a (quantised) TopoJSON topology: shared borders are stored once, and the topology is
// simplified in a topology-aware way so neighbouring countries stay perfectly aligned.
// KEEP ≈ share of points (by importance) retained; lower values distort tiny islands (Malta → triangle).
const KEEP = 0.7
const topo0 = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))
const pre = presimplify(topo0)
const topo = simplify(pre, quantile(pre, KEEP))
// Short arcs are tiny islands / small enclaves: simplification saves nothing there and visibly
// distorts them (Malta collapses to a polygon of a few points), so keep them as they are.
const PROTECT_BELOW = 40
topo.arcs = topo.arcs.map((arc, i) => (pre.arcs[i].length <= PROTECT_BELOW ? pre.arcs[i] : arc))
const countPoints = (t) => t.arcs.reduce((n, a) => n + a.length, 0)

const byNumeric = new Map(countries.filter((c) => c.numeric).map((c) => [String(c.numeric).padStart(3, '0'), c]))
const byName = new Map(countries.map((c) => [c.name.toLowerCase(), c]))
// Natural Earth parts without an ISO code of their own. Each is merged into the internationally
// recognised state (as for Northern Cyprus); dropping them left visible holes in the globe
// (Somaliland alone is 168,000 km² of Somalia). "Indian Ocean Ter." holds Christmas Island and the
// Cocos (Keeling) Islands; it goes to CXR first and SPLIT_TERRITORIES below moves the Cocos part.
// Siachen Glacier stays unassigned on purpose: it is disputed between India and Pakistan and the
// metadata does not decide it (see docs/MAP-AUDIT.md).
const nameAliases = { kosovo: 'XKX', 'n. cyprus': 'CYP', somaliland: 'SOM', 'indian ocean ter.': 'CXR' }

// Natural Earth draws some overseas territories as parts of their sovereign state, so French
// Guiana was selectable as "France" and France appeared to border Brazil. Each listed territory
// takes every polygon of its parent whose centroid lies within `radiusKm` of the territory's
// metadata position. Radii are wide enough for the archipelago and far below the distance to the
// parent's next part.
const SPLIT_TERRITORIES = [
  { code: 'GUF', parent: 'FRA', radiusKm: 400 },
  { code: 'GLP', parent: 'FRA', radiusKm: 120 },
  { code: 'MTQ', parent: 'FRA', radiusKm: 80 },
  { code: 'MYT', parent: 'FRA', radiusKm: 80 },
  { code: 'REU', parent: 'FRA', radiusKm: 80 },
  { code: 'SJM', parent: 'NOR', radiusKm: 700 },
  { code: 'BVT', parent: 'NOR', radiusKm: 80 },
  { code: 'BES', parent: 'NLD', radiusKm: 200 },
  { code: 'CCK', parent: 'CXR', radiusKm: 80 },
]

const unmatched = []
const merged = new Map() // alpha-3 -> geometry (Polygon/MultiPolygon on shared arcs)
const polysOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [])
for (const g of topo.objects.countries.geometries) {
  const id = g.id != null ? String(g.id).padStart(3, '0') : null
  const name = g.properties?.name ?? ''
  let c = id ? byNumeric.get(id) : undefined
  if (!c) c = byName.get(name.toLowerCase())
  if (!c) {
    const alias = nameAliases[name.toLowerCase()]
    if (alias) c = countries.find((x) => x.code === alias)
  }
  if (!c) { unmatched.push(name); continue }
  const polys = polysOf(g)
  if (!polys.length) continue
  const prev = merged.get(c.code)
  // Merge parts that map onto the same country (e.g. Northern Cyprus into Cyprus).
  if (prev) prev.arcs.push(...polys)
  else merged.set(c.code, { type: 'MultiPolygon', arcs: [...polys], properties: { code: c.code, name: c.name } })
}

// Split overseas territories out of their parent (see SPLIT_TERRITORIES). Only arc references
// move between geometries; the arcs themselves are untouched, so shared borders stay aligned.
for (const { code, parent, radiusKm } of SPLIT_TERRITORIES) {
  const t = countries.find((x) => x.code === code)
  const p = merged.get(parent)
  if (!t?.latlng || !p || merged.has(code)) continue
  const target = [t.latlng[1], t.latlng[0]] // metadata is [lat, lng], d3 wants [lng, lat]
  const taken = []
  const kept = []
  for (const poly of p.arcs) {
    const centroid = geoCentroid(feature(topo, { type: 'Polygon', arcs: poly }))
    const km = geoDistance(centroid, target) * 6371
    ;(km <= radiusKm ? taken : kept).push(poly)
  }
  // Never empty the parent: a territory rule must not swallow the sovereign state itself.
  if (!taken.length || !kept.length) continue
  p.arcs = kept
  merged.set(code, { type: 'MultiPolygon', arcs: taken, properties: { code, name: t.name } })
  console.log(`split ${code} from ${parent}: ${taken.length} part(s)`)
}

const out = {
  type: 'Topology',
  arcs: topo.arcs.map((arc) => {
    // drop the simplification weight, round to 0.01 deg and drop consecutive duplicates
    const pts = []
    for (const [x, y] of arc) {
      const p = [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
      const l = pts[pts.length - 1]
      if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p)
    }
    return pts.length >= 2 ? pts : arc.slice(0, 2).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])
  }),
  objects: { countries: { type: 'GeometryCollection', geometries: [...merged.values()] } },
}
writeFileSync('public/data/boundaries.json', JSON.stringify(out))
console.log('boundary points:', countPoints(topo0), '->', countPoints(out))
console.log('boundaries:', merged.size, 'unmatched:', unmatched)
console.log('countries without boundary:', countries.filter((c) => !merged.has(c.code)).map((c) => c.name).join(', '))

// --- cap triangulation ------------------------------------------------------
// The globe's country caps are triangulated here, once, instead of in every visitor's browser
// (that takes several seconds on the main thread). Vertices are stored as (lng, lat) pairs.
{
  globalThis.window = globalThis.window ?? {} // three-conic-polygon-geometry probes window.THREE
  const { default: ConicPolygonGeometry } = await import('three-conic-polygon-geometry')
  const R = 100 * 1.003 // keep in sync with CAP_RADIUS in src/lib/globeLayers.ts
  const RES = 6 // CURVATURE_RESOLUTION in src/lib/globeLayers.ts
  const lnglat = []
  const index = []
  const ranges = []
  for (const f of feature(out, out.objects.countries).features) {
    const vStart = lnglat.length / 2
    const iStart = index.length
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const coords of polys) {
      const g = new ConicPolygonGeometry(coords, R, R, false, true, false, RES)
      const p = g.attributes.position.array
      const base = lnglat.length / 2
      for (let i = 0; i < p.length; i += 3) {
        const r = Math.hypot(p[i], p[i + 1], p[i + 2])
        const theta = Math.atan2(p[i + 2], p[i])
        lnglat.push(
          90 - (theta * 180) / Math.PI - (theta < -Math.PI / 2 ? 360 : 0),
          90 - (Math.acos(p[i + 1] / r) * 180) / Math.PI,
        )
      }
      if (g.index) for (const v of g.index.array) index.push(base + v)
      else for (let i = 0; i < p.length / 3; i++) index.push(base + i)
    }
    ranges.push([f.properties.code, vStart, lnglat.length / 2 - vStart, iStart, index.length - iStart])
  }
  const buf = Buffer.concat([
    Buffer.from(new Float32Array(lnglat).buffer),
    Buffer.from(new Uint32Array(index).buffer),
  ])
  writeFileSync('public/data/geometry.bin', buf)
  writeFileSync(
    'public/data/geometry.json',
    JSON.stringify({ vertices: lnglat.length / 2, indices: index.length, ranges }),
  )
  console.log('geometry:', lnglat.length / 2, 'vertices,', index.length / 3, 'triangles,', Math.round(buf.length / 1024), 'KB')
}

// --- sitemap ----------------------------------------------------------------
const urls = ['/', ...countries.map((c) => `/countries/${c.code}`)]
writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>https://world-explorer.example${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`,
)
writeFileSync('public/robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://world-explorer.example/sitemap.xml\n')
