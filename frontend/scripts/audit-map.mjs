// Map audit: measures how faithful the shipped country geometry (public/data/boundaries.json) is
// to its unsimplified source (Natural Earth 1:50m via world-atlas) and to the country metadata.
//
//   node scripts/audit-map.mjs            -> prints a summary, writes docs/MAP-AUDIT.md + perf-results/map-audit.json
//   node scripts/audit-map.mjs --check    -> additionally fails (exit 1) if a metric is worse than scripts/map-audit-baseline.json
//   node scripts/audit-map.mjs --update-baseline -> stores the current metrics as the new baseline
//
// Why this works: build-data.mjs simplifies the topology but keeps the arc array index-for-index, so
// shipped arc i is the simplified + rounded version of source arc i. We can therefore compare every
// source vertex with the shipped line that replaced it, and rebuild each country from source arcs.
//
// Checks:
//  1. coverage      – countries in the metadata that have no polygon at all
//  2. displacement  – max / p95 distance (km) of source vertices from the shipped line (simplification + 0.01° rounding)
//  3. area drift    – shipped area vs source area (simplification effect) and vs metadata area (dataset effect, info only)
//  4. validity      – degenerate rings, self-intersecting rings, rings with wrong winding (area > hemisphere)
//  5. neighbours    – land neighbours in the topology (shared arcs) vs the `borders` list in the metadata
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { feature } from 'topojson-client'
import { geoArea } from 'd3-geo'

const require = createRequire(import.meta.url)
const args = new Set(process.argv.slice(2))
const EARTH_KM = 6371.0088
const BASELINE = 'scripts/map-audit-baseline.json'

const shipped = JSON.parse(readFileSync('public/data/boundaries.json', 'utf8'))
const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8'))
const source = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))
const byCode = new Map(countries.map((c) => [c.code, c]))
const geometries = shipped.objects.countries.geometries

// --- decode the quantised, delta-encoded source arcs into absolute lon/lat ---------------------
const { scale: [sx, sy], translate: [tx, ty] } = source.transform
const sourceArcs = source.arcs.map((arc) => {
  let x = 0, y = 0
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] })
})
if (sourceArcs.length !== shipped.arcs.length) {
  console.error(`arc count differs (source ${sourceArcs.length}, shipped ${shipped.arcs.length}) – audit assumes index-aligned arcs`)
  process.exit(2)
}

// --- small spherical helpers ---------------------------------------------------------------------
const rad = Math.PI / 180
// Distance from point p to segment ab in km, using a local equirectangular projection around p.
// Accurate to well under 1 % for the sub-degree distances we care about here.
function pointSegmentKm(p, a, b) {
  const k = Math.cos(p[1] * rad)
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1]
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1]
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(cx, cy) * rad * EARTH_KM
}
function pointLineKm(p, line) {
  let best = Infinity
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointSegmentKm(p, line[i - 1], line[i]))
  return line.length === 1 ? pointSegmentKm(p, line[0], line[0]) : best
}
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

// --- 2. displacement per arc ---------------------------------------------------------------------
// The simplification keeps a subset of each arc's source vertices in order and then rounds them to
// 0.01°. So every shipped vertex m comes from some source vertex k_m, and the source vertices between
// k_m and k_m+1 were replaced by the shipped segment (m, m+1). Measuring each source vertex against
// exactly that segment is the usual definition of simplification error and runs in linear time.
// If the mapping fails for an arc (it should not), we fall back to the nearest segment of the arc.
const round2 = (v) => Math.round(v * 100) / 100
let fallbackArcs = 0
const arcError = sourceArcs.map((src, i) => {
  const line = shipped.arcs[i]
  const all = []
  const anchors = [] // source index for each shipped vertex
  let k = 0
  for (const q of line) {
    while (k < src.length && (round2(src[k][0]) !== q[0] || round2(src[k][1]) !== q[1])) k++
    if (k === src.length) break
    anchors.push(k)
  }
  if (anchors.length === line.length && line.length >= 2) {
    for (let m = 0; m + 1 < line.length; m++) {
      const last = m + 2 === line.length ? src.length - 1 : anchors[m + 1]
      for (let s = anchors[m]; s <= last; s++) all.push(pointSegmentKm(src[s], line[m], line[m + 1]))
    }
  } else {
    fallbackArcs++
    for (const p of src) all.push(pointLineKm(p, line))
  }
  return { max: all.reduce((a, b) => Math.max(a, b), 0), all }
})

// arcs used by each country (index >= 0, ~i means reversed)
const arcsOf = (g) => g.arcs.flat(2).map((i) => (i < 0 ? ~i : i))

// --- 5. neighbours from shared arcs -----------------------------------------------------------
const arcOwners = new Map()
for (const g of geometries) for (const a of new Set(arcsOf(g))) {
  if (!arcOwners.has(a)) arcOwners.set(a, new Set())
  arcOwners.get(a).add(g.properties.code)
}
const topoNeighbours = new Map(geometries.map((g) => [g.properties.code, new Set()]))
for (const owners of arcOwners.values()) for (const a of owners) for (const b of owners) if (a !== b) topoNeighbours.get(a).add(b)

// --- per-country evaluation -------------------------------------------------------------------
const sourceTopo = { type: 'Topology', arcs: sourceArcs, objects: shipped.objects }
const shippedFeatures = new Map(feature(shipped, shipped.objects.countries).features.map((f) => [f.properties.code, f]))
const sourceFeatures = new Map(feature(sourceTopo, shipped.objects.countries).features.map((f) => [f.properties.code, f]))

function ringsOf(geom) {
  return geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : []
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}
// Counts proper crossings between non-adjacent edges of one ring (planar lon/lat; rings are cut at the antimeridian).
// Sweep over x: edges are sorted by their left end, so each edge is only compared with the edges whose
// x-range overlaps it. Comparing every pair took over a minute for Russia and Antarctica.
function selfIntersections(ring) {
  const n = ring.length - 1
  if (n < 4) return 0
  const edges = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[i + 1]
    edges.push({ i, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) })
  }
  edges.sort((p, q) => p.x0 - q.x0)
  let hits = 0
  for (let s = 0; s < n; s++) {
    const p = edges[s]
    for (let t = s + 1; t < n && edges[t].x0 <= p.x1; t++) {
      const q = edges[t]
      const lo = Math.min(p.i, q.i), hi = Math.max(p.i, q.i)
      if (hi - lo < 2 || (lo === 0 && hi === n - 1)) continue // neighbouring edges share a vertex
      if (p.y1 < q.y0 || q.y1 < p.y0) continue
      if (segmentsCross(ring[lo], ring[lo + 1], ring[hi], ring[hi + 1])) hits++
    }
  }
  return hits
}

// Neighbour differences that are explained by the datasets, not by our build. Each needs a reason;
// anything not listed here counts as a finding.
const KNOWN_NEIGHBOUR_EXCEPTIONS = {
  'BWA-ZMB': 'Kazungula: a ~150 m border segment, below 1:50m resolution',
  'ESP-MAR': 'Ceuta and Melilla are too small for 1:50m and absent from the source',
  'IND-LKA': 'metadata lists the maritime boundary; there is no land border',
}

// Self-crossings already present in Natural Earth are not ours to fix; count only the ones the
// simplification adds.
const sourceFeatureFor = (code) => sourceFeatures.get(code)

const rows = []
for (const g of geometries) {
  const code = g.properties.code
  const meta = byCode.get(code)
  const fShip = shippedFeatures.get(code), fSrc = sourceFeatures.get(code)
  const areaShip = geoArea(fShip) * EARTH_KM ** 2
  const areaSrc = geoArea(fSrc) * EARTH_KM ** 2
  const errs = []
  let maxKm = 0
  for (const a of new Set(arcsOf(g))) { maxKm = Math.max(maxKm, arcError[a].max); errs.push(...arcError[a].all) }
  errs.sort((x, y) => x - y)

  let degenerate = 0, crossings = 0, sourceCrossings = 0, wrongWinding = 0
  for (const ring of ringsOf(fShip.geometry)) {
    const distinct = new Set(ring.map((p) => p.join(','))).size
    if (distinct < 3) degenerate++
    else crossings += selfIntersections(ring)
  }
  for (const ring of ringsOf(sourceFeatureFor(code).geometry)) sourceCrossings += selfIntersections(ring)
  // A ring with the wrong orientation makes d3 treat it as "everything except the country".
  for (const poly of fShip.geometry.type === 'Polygon' ? [fShip.geometry.coordinates] : fShip.geometry.coordinates) {
    if (geoArea({ type: 'Polygon', coordinates: [poly[0]] }) > 2 * Math.PI) wrongWinding++
  }

  const metaArea = meta?.area > 0 ? meta.area : null // the metadata uses -1 for "unknown" (Svalbard)
  const metaBorders = new Set(meta?.borders ?? [])
  const topo = topoNeighbours.get(code)
  rows.push({
    code, name: meta?.name ?? g.properties.name,
    rings: ringsOf(fShip.geometry).length,
    maxKm: round(maxKm), p95Km: round(quantile(errs, 0.95)),
    areaKm2: Math.round(areaShip), sourceAreaKm2: Math.round(areaSrc), metaAreaKm2: metaArea,
    simplifyDriftPct: areaSrc > 0 ? round(((areaShip - areaSrc) / areaSrc) * 100) : 0,
    metaDriftPct: metaArea ? round(((areaSrc - metaArea) / metaArea) * 100, 1) : null,
    degenerate, crossings, sourceCrossings, introducedCrossings: Math.max(0, crossings - sourceCrossings), wrongWinding,
    missingNeighbours: [...metaBorders].filter((b) => byCode.has(b) && shippedFeatures.has(b) && !topo.has(b)),
    extraNeighbours: [...topo].filter((b) => !metaBorders.has(b)),
  })
}

// --- 1. coverage ---------------------------------------------------------------------------------
const noPolygon = countries.filter((c) => !shippedFeatures.has(c.code)).map((c) => ({ code: c.code, name: c.name, areaKm2: c.area }))

// --- summary + gate ---------------------------------------------------------------------------
const allMax = rows.map((r) => r.maxKm).sort((a, b) => a - b)
const neighbourPairs = (key, { known = false } = {}) => {
  const s = new Set()
  for (const r of rows) for (const n of r[key]) s.add([r.code, n].sort().join('-'))
  return [...s].filter((p) => (p in KNOWN_NEIGHBOUR_EXCEPTIONS) === known).sort()
}
const large = rows.filter((r) => r.sourceAreaKm2 > 1000)
const summary = {
  countriesWithPolygon: rows.length,
  countriesWithoutPolygon: noPolygon.length,
  maxDisplacementKm: allMax.at(-1),
  p95CountryMaxDisplacementKm: quantile(allMax, 0.95),
  // Rounding to 0.01° visibly changes areas of 1 km² states (Vatican); that is reported per country
  // below but would make a global gate meaningless, so the gate looks at countries > 1,000 km².
  maxAbsSimplifyDriftPctOver1000Km2: Math.max(...large.map((r) => Math.abs(r.simplifyDriftPct))),
  degenerateRings: rows.reduce((n, r) => n + r.degenerate, 0),
  introducedSelfIntersections: rows.reduce((n, r) => n + r.introducedCrossings, 0),
  sourceSelfIntersections: rows.reduce((n, r) => n + r.sourceCrossings, 0),
  wrongWindingRings: rows.reduce((n, r) => n + r.wrongWinding, 0),
  unexplainedMissingNeighbourPairs: neighbourPairs('missingNeighbours').length,
  unexplainedExtraNeighbourPairs: neighbourPairs('extraNeighbours').length,
}

mkdirSync('perf-results', { recursive: true })
writeFileSync('perf-results/map-audit.json', JSON.stringify({ summary, noPolygon, rows }, null, 2))

const worst = [...rows].sort((a, b) => b.maxKm - a.maxKm).slice(0, 15)
const drift = [...rows].filter((r) => r.metaDriftPct != null && r.metaAreaKm2 > 1000)
  .sort((a, b) => Math.abs(b.metaDriftPct) - Math.abs(a.metaDriftPct)).slice(0, 15)
const invalid = rows.filter((r) => r.degenerate || r.crossings || r.sourceCrossings || r.wrongWinding)
const md = `# Map audit (generated)

Generated by \`npm run audit:map\` from \`public/data/boundaries.json\` against the unsimplified
Natural Earth 1:50m source (\`world-atlas/countries-50m.json\`) and \`public/data/countries.json\`.
Do not edit by hand. Displacement = distance of each source vertex from the shipped line, caused by
topology-preserving simplification (keep ${'≈'}70 % of points, with a per-arc error bound of 3 km in
\`scripts/build-data.mjs\`) and rounding to 0.01°. It measures **our** loss
of detail, not the accuracy of Natural Earth itself (see [MAP-ACCURACY.md](MAP-ACCURACY.md)).

## Summary

| Metric | Value |
| --- | --- |
${Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Largest displacement (top 15)

| Country | max km | p95 km | area drift vs source |
| --- | ---: | ---: | ---: |
${worst.map((r) => `| ${r.name} (${r.code}) | ${r.maxKm} | ${r.p95Km} | ${r.simplifyDriftPct} % |`).join('\n')}

## Source area vs metadata area (top 15, countries > 1,000 km²)

Natural Earth 1:50m omits small islands and draws coasts generalised; the metadata area includes
inland water. Large differences are a property of the datasets, reported for information only.

| Country | source km² | metadata km² | difference |
| --- | ---: | ---: | ---: |
${drift.map((r) => `| ${r.name} (${r.code}) | ${r.sourceAreaKm2.toLocaleString('en')} | ${r.metaAreaKm2.toLocaleString('en')} | ${r.metaDriftPct} % |`).join('\n')}

## Geometry validity

Self-crossings are counted in the shipped data and in the source; only the difference is caused by
our simplification.

${invalid.length ? invalid.map((r) => `- ${r.name} (${r.code}): ${r.degenerate} degenerate ring(s), ${r.crossings} self-crossings shipped / ${r.sourceCrossings} in source, ${r.wrongWinding} wrong winding`).join('\n') : 'No degenerate, self-intersecting or wrongly wound rings.'}

## Countries without polygon (${noPolygon.length})

${noPolygon.map((c) => `${c.name} (${c.code})`).join(', ')}

## Neighbour consistency

Unexplained land borders in the metadata without a shared arc in the topology:
${neighbourPairs('missingNeighbours').join(', ') || 'none'}

Unexplained shared arcs without a metadata border:
${neighbourPairs('extraNeighbours').join(', ') || 'none'}

Known dataset differences (not counted as findings):

${Object.entries(KNOWN_NEIGHBOUR_EXCEPTIONS).map(([pair, why]) => `- ${pair}: ${why}`).join('\n')}

## Unassigned source parts

Siachen Glacier is disputed between India and Pakistan and is intentionally not assigned to either
state, so it remains a gap in the country layer.
`
writeFileSync('../docs/MAP-AUDIT.md', md)

console.table(summary)
console.log(`displacement: ${sourceArcs.length - fallbackArcs} arcs measured segment-wise, ${fallbackArcs} by nearest segment`)
if (args.has('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(summary, null, 2) + '\n')
  console.log('baseline updated:', BASELINE)
}
if (args.has('--check')) {
  if (!existsSync(BASELINE)) { console.error('no baseline – run with --update-baseline first'); process.exit(1) }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  // Every metric except countriesWithPolygon is "lower is better"; allow 1 % float noise on distances.
  const worse = Object.entries(summary).filter(([k, v]) =>
    k === 'countriesWithPolygon' ? v < base[k] : v > base[k] * 1.01 + 1e-9)
  if (worse.length) {
    for (const [k, v] of worse) console.error(`REGRESSION ${k}: ${base[k]} -> ${v}`)
    process.exit(1)
  }
  console.log('map audit: no regression against baseline')
}
