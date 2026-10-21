// Original schematic occupation masks clipped against CShapes' pre-war sovereign footprints.
// These are educational regional reconstructions, not exhaustive military situation maps.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import polygonClipping from 'polygon-clipping'
import { topology } from 'topojson-server'
import { feature } from 'topojson-client'
import { presimplify, simplify } from 'topojson-simplify'
import { WW2_MOMENTS } from '../src/lib/ww2.ts'
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
const ww2Source = 'https://encyclopedia.ushmm.org/content/en/gallery/german-occupation-maps'
const actors = {
  imperialGermany: { actor: { de: 'Deutsches Kaiserreich', en: 'German Empire' }, color: '#fb7185' },
  austriaHungary: { actor: { de: 'Österreich-Ungarn', en: 'Austria-Hungary' }, color: '#fb923c' },
  bulgaria: { actor: { de: 'Bulgarien', en: 'Bulgaria' }, color: '#c084fc' },
  naziGermany: { actor: { de: 'NS-Deutschland', en: 'Nazi Germany' }, color: '#fb7185' },
  sovietUnion: { actor: { de: 'Sowjetunion', en: 'Soviet Union' }, color: '#c084fc' },
  italy: { actor: { de: 'Faschistisches Italien', en: 'Fascist Italy' }, color: '#fb923c' },
  westernAllies: { actor: { de: 'Westalliierte Streitkräfte', en: 'Western Allied forces' }, color: '#38bdf8' },
  axisEast: { actor: { de: 'Deutsche und verbündete Besatzungstruppen', en: 'German and allied occupation forces' }, color: '#e879a0' },
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

// Dates align with the existing WWII learning moments. Footprints are deliberately regional.
const dates = ['1939-09-16', '1940-06-04', '1941-11-12', '1942-11-18', '1943-12-15', '1944-12-15', '1945-04-15']
const frontMask = (line, closureLng) => [[...line, [closureLng, line.at(-1)[1]], [closureLng, line[0][1]], line[0]]]
const polandWest = [[[14,49],[22,49],[22.7,50],[23.5,51.5],[23.5,52.4],[22,53.4],[21.5,55],[14,55],[14,49]]]
const polandEast = [[[22,49],[26,49],[29,55],[21.5,55],[22,53.4],[23.5,52.4],[23.5,51.5],[22.7,50],[22,49]]]
for (const date of dates) {
  const year = Number(date.slice(0, 4))
  const s = snapshot('ww2', year, date, { de: 'Ausgewählte europäische Besatzungsräume in Polen, Westeuropa, Albanien, Abschnitte der Ostfront und 1945 Deutschland. Keine globale Vollabdeckung; Frontflächen umfassen nur den belegten Breitengradbereich und sind schematisch.', en: 'Selected European occupation areas in Poland, Western Europe, Albania, sections of the Eastern Front and, in 1945, Germany. Not global coverage; front areas cover only the sourced latitude range and are schematic.' })
  const moment = WW2_MOMENTS.find((item) => item.year === year)
  const easternFront = moment.fronts.find((front) => front.id.startsWith('east-'))
  if (year === 1939) {
    // The selected day precedes the Soviet invasion of 17 September.
    add(s, 'poland-invasion', 'naziGermany', ['Poland'], 1939, box(14, 49, 20.6, 55), { de: 'Westpolen · besetzter Raum während des Angriffs', en: 'Western Poland · occupied area during the invasion' }, 'https://www.armyupress.army.mil/Portals/7/online-publications/documents/the-european-war-military-review-december-1939.pdf')
  } else if (year <= 1943) {
    add(s, 'poland-west', 'naziGermany', ['Poland'], 1939, year === 1940 ? polandWest : null, { de: 'Besetztes Polen · Vorkriegsumriss', en: 'Occupied Poland · pre-war footprint' }, ww2Source)
    if (year === 1940) add(s, 'poland-east', 'sovietUnion', ['Poland'], 1939, polandEast, { de: 'Sowjetisch besetztes Ostpolen', en: 'Soviet-occupied eastern Poland' }, 'https://encyclopedia.ushmm.org/content/en/article/german-soviet-pact')
  } else if (year === 1944) {
    add(s, 'poland-west', 'naziGermany', ['Poland'], 1939, box(14,49,20.5,55), { de: 'Westpolen · verbleibende deutsche Besatzung, schematisch', en: 'Western Poland · remaining German occupation, schematic' }, atlas)
  }
  if (year >= 1940 && year <= 1943) {
    add(s, 'benelux', 'naziGermany', ['Belgium', 'Netherlands', 'Luxembourg'], 1939, box(-1,48,8,54), { de: 'Besetzte Benelux-Staaten · europäische Gebiete', en: 'Occupied Benelux countries · European territories' }, ww2Source)
    add(s, 'denmark', 'naziGermany', ['Denmark'], 1939, box(7,54,16,58), { de: 'Besetztes Dänemark · europäisches Gebiet', en: 'Occupied Denmark · European territory' }, ww2Source)
    const franceMask = year === 1940 ? [[[ -5, 49.8],[1.5,50.1],[2.2,49.95],[2.7,49.88],[3.25,49.6],[3.95,49.5],[4.35,49.55],[8,49.5],[8,52],[-5,52],[-5,49.8]]]
      : year === 1941 ? [[[-5,48.7],[-1.3,47.3],[0.5,47],[1.5,46.7],[3,46.5],[4.5,46.8],[6.5,47.5],[8,48],[8,52],[-5,52],[-5,48.7]]]
        : year === 1942 ? box(-6,42,5.2,52) : box(-6,42,8.3,52)
    add(s, 'france', 'naziGermany', ['France'], 1939, franceMask, { de: 'Frankreich · ausgewählter Besatzungsraum', en: 'France · selected occupation area' }, year === 1940 ? 'https://dhc.westpoint.edu/wp-content/uploads/sites/6/2025/01/WWIIEurope13.jpg' : ww2Source)
  }
  if (year <= 1942) add(s, 'albania', 'italy', ['Albania'], 1939, null, { de: 'Italienisch besetztes Albanien', en: 'Italian-occupied Albania' }, atlas)
  if (year === 1943) add(s, 'albania', 'naziGermany', ['Albania'], 1939, null, { de: 'Deutsche Besatzung Albaniens nach Italiens Kapitulation', en: 'German occupation of Albania following Italy’s surrender' }, atlas)
  if (year >= 1941 && year <= 1943) {
    add(s, 'eastern-front', 'axisEast', ['Russia (Soviet Union)', 'Estonia', 'Latvia', 'Lithuania'], 1939, frontMask(easternFront.line, 20), { de: 'Ostfront · ausgewählter besetzter Raum westlich der schematischen Front', en: 'Eastern Front · selected occupied area west of the schematic front' }, easternFront.source.url)
  }
  if (year === 1945) {
    const westernFront = moment.fronts.find((front) => front.id.startsWith('west-'))
    add(s, 'germany-west', 'westernAllies', ['Germany'], 1937, frontMask(westernFront.line, 4), { de: 'Westdeutschland · alliiert kontrollierter Raum, schematisch', en: 'Western Germany · Allied-controlled area, schematic' }, westernFront.source.url)
    add(s, 'germany-east', 'sovietUnion', ['Germany'], 1937, frontMask(easternFront.line, 23), { de: 'Ostdeutschland · sowjetisch kontrollierter Raum, schematisch', en: 'Eastern Germany · Soviet-controlled area, schematic' }, easternFront.source.url)
  }
}
writeFileSync('public/data/territories-history.json', JSON.stringify({ schemaVersion: 1, sourceSha256: { 'CShapes-2.0.geojson': hash }, method: 'Original regional schematic masks clipped to pre-war CShapes footprints; not exact or exhaustive occupation boundaries.', snapshots }))
console.log(`Wrote ${snapshots.length} occupation snapshots / ${snapshots.reduce((n, s) => n + s.features.length, 0)} sourced features`)
