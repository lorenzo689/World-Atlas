// Historical territory layers. WWI: original schematic occupation masks clipped against CShapes'
// pre-war sovereign footprints (educational regional reconstructions). WWII: the dated areas from
// scripts/data/ww2-occupation.json (see build-ww2-occupation.mjs), simplified for shipping.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import polygonClipping from 'polygon-clipping'
import { topology } from 'topojson-server'
import { feature } from 'topojson-client'
import { presimplify, simplify } from 'topojson-simplify'
const { intersection, union } = polygonClipping

const input = readFileSync('scripts/source/historical/CShapes-2.0.geojson')
const hash = createHash('sha256').update(input).digest('hex')
if (hash !== '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42') throw new Error('CShapes revision changed; review before rebuilding')
const raw = JSON.parse(input)
const day = (p, prefix) => p[`${prefix}year`] * 10000 + p[`${prefix}month`] * 100 + p[`${prefix}day`]
const country = (name, year) => {
  if (name === 'Germany') name = 'Germany (Prussia)'
  const date = year * 10000 + 101
  const f = raw.features.find((f) => f.properties.cntry_name === name && day(f.properties, 'gws') <= date && day(f.properties, 'gwe') >= date)
  if (!f) throw new Error(`Missing sovereign geometry: ${name}, ${year}`)
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
}
const box = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
const region = (names, year, mask) => {
  const base = union(...names.map((name) => country(name, year)))
  return mask ? intersection(base, mask) : base
}
const atlas = 'https://dhc.westpoint.edu/atlases/'
const ww1Source = 'https://www.trumanlibrary.gov/maps/m1932-map-western-front'
const westernSources = {
  1914: 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/04/WWOne10-01.jpg',
  1915: 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/04/WWOne11-01.jpg',
  1916: 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/04/WWOne13-01.jpg',
  1917: 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/04/WWOne17Combined-01.jpg',
  1918: ww1Source,
}
const actors = {
  imperialGermany: { actor: { de: 'Deutsches Kaiserreich', en: 'German Empire' }, color: '#fb7185' },
  austriaHungary: { actor: { de: 'Österreich-Ungarn', en: 'Austria-Hungary' }, color: '#fb923c' },
  bulgaria: { actor: { de: 'Bulgarien', en: 'Bulgaria' }, color: '#c084fc' },
}
const snapshots = []
function snapshot(scenario, year, date, coverage) {
  const value = { id: `${scenario}-${date}`, scenario, year, date, coverage, features: [] }
  snapshots.push(value)
  return value
}
function add(snapshot, id, actorId, names, boundaryYear, mask, title, url, kind = 'occupation') {
  let coordinates = region(names, boundaryYear, mask)
  if (!coordinates.length) throw new Error(`Empty reconstructed territory: ${id}`)
  // Topological simplification keeps holes and island parts while limiting the shipped payload.
  const topo = simplify(presimplify(topology({ area: { type: 'MultiPolygon', coordinates } }, 1e6)), 0.000004)
  const geometry = feature(topo, topo.objects.area).geometry
  snapshot.features.push({ id: `${snapshot.id}-${id}`, actorId, ...actors[actorId], title, kind, precision: 'schematic', source: { title: 'Historical occupation reconstruction · CShapes base; archival/museum reference', url, date: snapshot.date, license: 'CC BY-NC-SA 4.0 (CShapes derivative)', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }, geometry })
}

// Generalized stabilized Western Front. The coastal Belgian enclave remains unshaded.
// Each year's mask is an original regional generalization, not copied source linework.
const west1914 = [[[2.75,51.3],[2.9,50.85],[2.8,50.5],[2.75,50],[3.15,49.5],[4,49.4],[4.9,49.3],[5.5,49],[6.3,48.6],[7.2,48.5],[8,49],[8,52],[2.75,52],[2.75,51.3]]]
const west1917 = [[[2.75,51.3],[2.95,50.85],[3,50.35],[3.1,50],[3.3,49.7],[3.6,49.5],[4.2,49.4],[4.9,49.3],[5.5,49],[6.3,48.6],[7.2,48.5],[8,49],[8,52],[2.75,52],[2.75,51.3]]]
const west1918 = [[[2.75,51.3],[2.85,50.85],[2.55,50.55],[2.5,50],[2.4,49.9],[2.8,49.55],[3.2,49.5],[4.2,49.4],[4.9,49.3],[5.5,49],[6.3,48.6],[7.2,48.5],[8,49],[8,52],[2.75,52],[2.75,51.3]]]
for (const year of [1914, 1915, 1916, 1917, 1918]) {
  // 1918 deliberately uses the documented May 1 state, before the later Allied advances.
  const date = year === 1918 ? '1918-05-01' : `${year}-12-31`
  const s = snapshot('ww1', year, date, { de: 'Ausgewählte Besatzungsräume: Belgien, Nordostfrankreich, Luxemburg und ab 1916 Serbien. Stark vereinfachte Rekonstruktion; keine vollständige Frontkarte.', en: 'Selected occupation areas: Belgium, northeastern France, Luxembourg and, from 1916, Serbia. Strongly generalized reconstruction; not a complete front map.' })
  add(s, 'western-occupation', 'imperialGermany', ['Belgium', 'France', 'Luxembourg'], 1914, year === 1918 ? west1918 : year === 1917 ? west1917 : west1914, { de: 'Besetzte Gebiete an der Westfront', en: 'Occupied areas on the Western Front' }, westernSources[year])
  if (year >= 1916) {
    add(s, 'serbia-west', 'austriaHungary', ['Serbia'], 1914, box(18, 41, 21.25, 46), { de: 'Westliches Serbien · schematische Besatzungszone', en: 'Western Serbia · schematic occupation zone' }, atlas)
    add(s, 'serbia-east', 'bulgaria', ['Serbia'], 1914, box(21.25, 41, 24, 46), { de: 'Östliches und südliches Serbien · schematische Besatzungszone', en: 'Eastern and southern Serbia · schematic occupation zone' }, atlas)
  }
}

// WWII: dated occupation, annexation and client-state areas built by build-ww2-occupation.mjs
// (OpenHistoricalMap regimes, georeferenced U.S. Army atlas sheets, documented schematic areas).
// Intermediate file (~25 MB, not committed): rebuild it with `npm run data:ww2:occupation`.
if (!existsSync('scripts/data/ww2-occupation.json')) throw new Error('Missing scripts/data/ww2-occupation.json: run npm run data:ww2:occupation first')
const ww2 = JSON.parse(readFileSync('scripts/data/ww2-occupation.json', 'utf8'))
if (ww2.cshapesSha256 !== hash) throw new Error('ww2-occupation.json was built from another CShapes revision; rebuild it')
const ww2Coverage = {
  de: 'Besatzungs-, Annexions- und Satellitengebiete in Europa zum Stichtag. Grenzen aus datierten OpenHistoricalMap-Verwaltungsgrenzen; 1943–1945 auf das im US-Armee-Atlas gehaltene Gebiet zugeschnitten. Asien und Nordafrika sind nicht abgedeckt; ungefärbt heißt „keine Aussage“.',
  en: 'Occupation, annexation and client-state areas in Europe on the selected date. Boundaries from dated OpenHistoricalMap administrative borders; 1943–1945 clipped to the area held according to the U.S. Army atlas. Asia and North Africa are not covered; unshaded means "no claim".',
}
// One topology per date: neighbouring areas share their border arcs, so simplification moves both
// sides together and cannot open gaps or overlaps between them. The threshold (square degrees of
// the smallest kept triangle) removes detail far below the sources' accuracy (OHM line work is
// marked approximate; atlas ±8–10 km). Coordinates are rounded to 0.001° (~100 m).
const WW2_SIMPLIFY = 0.0004
const round3 = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000] : c.map(round3))
for (const { date, features } of ww2.snapshots) {
  const s = snapshot('ww2', Number(date.slice(0, 4)), date, ww2Coverage)
  const topo = simplify(presimplify(topology(Object.fromEntries(features.map((f, i) => [`f${i}`, f.geometry])), 1e6)), WW2_SIMPLIFY)
  for (const [i, f] of features.entries()) {
    const simplified = feature(topo, topo.objects[`f${i}`]).geometry
    const geometry = { type: simplified.type, coordinates: round3(simplified.coordinates) }
    s.features.push({
      id: `${s.id}-${f.id}`, actorId: f.actorId, ...ww2.actors[f.actorId], title: f.title, kind: f.kind, precision: f.precision,
      ...(f.note ? { note: f.note } : {}),
      source: { ...f.source, date },
      ...(f.evidence ? { evidence: { ...f.evidence, date } } : {}),
      geometry,
    })
  }
}
writeFileSync('public/data/territories-history.json', JSON.stringify({ schemaVersion: 1, sourceSha256: { 'CShapes-2.0.geojson': hash }, method: 'Original regional schematic masks clipped to pre-war CShapes footprints; not exact or exhaustive occupation boundaries.', snapshots }))
console.log(`Wrote ${snapshots.length} occupation snapshots / ${snapshots.reduce((n, s) => n + s.features.length, 0)} sourced features`)
