// Occupation, annexation and client-state areas for the seven WWII moments.
//
//   npm run data:ww2:occupation   (needs scripts/data/ww2-atlas.json from npm run data:ww2:atlas)
//
// Three kinds of evidence, recorded per feature as `precision`:
//  - administrative: dated OpenHistoricalMap boundary of an occupation regime (CC0), clipped to land;
//  - digitized: an area clipped to the Axis-held territory of a georeferenced U.S. Army atlas sheet
//    (1943-12-15, 1944-12-15, 1945-04-15; positional uncertainty is the sheet's leave-one-out error);
//  - schematic: an original generalisation where neither exists (named in `note`).
// Occupation is not sovereignty: the base map keeps its separate state borders.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import polygonClipping from 'polygon-clipping'
import { ohmRelation, forSphere } from './lib/ohm.mjs'
import { roleOf, reasonOf, unitTitle } from './lib/ww2-sides.mjs'
import { WW2_MOMENTS } from '../src/lib/ww2.ts'

// polygon-clipping can fail ("Unable to find segment … in SweepLine tree") on nearly coincident
// segments from independently traced sources (OHM, CShapes, atlas). Snapping all inputs to a
// grid is the usual remedy: first 1e-6° (~0.1 m), then coarser up to 1e-4° (~10 m), far below
// the sources' accuracy.
const snap = (coords, step) => coords.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [Math.round(x / step) * step, Math.round(y / step) * step])))
const robust = (op) => (...args) => {
  for (const step of [0, 1e-6, 1e-5, 1e-4]) {
    try { return op(...(step ? args.map((a) => snap(a, step)) : args)) } catch (error) { if (step === 1e-4) throw error }
  }
}
const intersection = robust(polygonClipping.intersection)
const union = robust(polygonClipping.union)
const difference = robust(polygonClipping.difference)

// ---- inputs ----------------------------------------------------------------------------------
const cshapesInput = readFileSync('scripts/source/historical/CShapes-2.0.geojson')
const cshapesHash = createHash('sha256').update(cshapesInput).digest('hex')
if (cshapesHash !== '384b1ea90b9419f30a858d7ec237c85a22c60d1b35b5f85f215a1204f9989d42') throw new Error('CShapes revision changed; review before rebuilding')
const cshapes = JSON.parse(cshapesInput)
const dayOf = (p, prefix) => p[`${prefix}year`] * 10000 + p[`${prefix}month`] * 100 + p[`${prefix}day`]
const asNumber = (date) => Number(date.replaceAll('-', ''))
/** Sovereign footprint of a CShapes state on a date (planar MultiPolygon). */
function state(name, date) {
  const day = asNumber(date)
  const f = cshapes.features.find((x) => x.properties.cntry_name === name && dayOf(x.properties, 'gws') <= day && dayOf(x.properties, 'gwe') >= day)
  if (!f) throw new Error(`Missing CShapes geometry: ${name} on ${date}`)
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
}
const atlas = JSON.parse(readFileSync('scripts/data/ww2-atlas.json', 'utf8'))
/** Atlas outputs are sphere-wound (clockwise); polygon-clipping wants planar (counter-clockwise). */
const planar = (coordinates) => coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse()))
const toSheet = (s) => ({ ...s, axis: planar(s.axisHeld.coordinates), frame: planar(s.extent.type === 'Polygon' ? [s.extent.coordinates] : s.extent.coordinates) })
/** The European sheet of a date (the regime clipping below concerns Europe). */
const sheet = (date, region = 'europe') => {
  const s = atlas.sheets.find((x) => x.date === date && x.region === region)
  if (!s) throw new Error(`No ${region} atlas sheet for ${date}`)
  return toSheet(s)
}
const box = (w, s, e, n) => [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]]
/** Area west of a north–south front line, closed at `closureLng` (only within the line's latitude span). */
const westOf = (line, closureLng) => [[[...line, [closureLng, line.at(-1)[1]], [closureLng, line[0][1]], line[0]]]]
const ohm = (id, start, end) => ohmRelation(id, start, end).then((r) => ({ ...r, coordinates: r.coordinates }))

// ---- actors -----------------------------------------------------------------------------------
const ACTORS = {
  naziGermany: { actor: { de: 'NS-Deutschland', en: 'Nazi Germany' }, color: '#fb7185' },
  italy: { actor: { de: 'Faschistisches Italien', en: 'Fascist Italy' }, color: '#fb923c' },
  axisJoint: { actor: { de: 'Deutsche und italienische Besatzung', en: 'German and Italian occupation' }, color: '#f472b6' },
  axisEast: { actor: { de: 'Deutsche und verbündete Besatzungstruppen', en: 'German and allied occupation forces' }, color: '#e879a0' },
  hungary: { actor: { de: 'Königreich Ungarn', en: 'Kingdom of Hungary' }, color: '#fbbf24' },
  bulgaria: { actor: { de: 'Zarentum Bulgarien', en: 'Tsardom of Bulgaria' }, color: '#a3e635' },
  client: { actor: { de: 'Satellitenstaaten der Achse', en: 'Axis client states' }, color: '#e879f9' },
  sovietUnion: { actor: { de: 'Sowjetunion', en: 'Soviet Union' }, color: '#c084fc' },
  westernAllies: { actor: { de: 'Westalliierte Streitkräfte', en: 'Western Allied forces' }, color: '#38bdf8' },
  japan: { actor: { de: 'Kaiserreich Japan', en: 'Empire of Japan' }, color: '#fb7185' },
}

// ---- sources ----------------------------------------------------------------------------------
const OHM_LICENSE = { license: 'CC0 (OpenHistoricalMap)', licenseUrl: 'https://www.openhistoricalmap.org/copyright' }
const CSHAPES_LICENSE = { license: 'CC BY-NC-SA 4.0 (CShapes derivative)', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }
const USHMM_MAPS = 'https://encyclopedia.ushmm.org/content/en/gallery/german-occupation-maps'
const fromOhm = (r) => ({ title: `OpenHistoricalMap · ${r.tags['name:en'] ?? r.tags.name} (${r.tags.start_date} – ${r.tags.end_date})`, url: r.provenance.source, ...OHM_LICENSE })
const fromAtlas = (s) => ({ title: `${s.source.title} · ${s.date} (±${s.georeference.looRmsKm} km)`, url: s.source.page, license: s.source.license })
const fromMap = (title, url) => ({ title, url, ...CSHAPES_LICENSE })

// ---- the moments ------------------------------------------------------------------------------
// Each entry: id, actor, kind ('occupation' | 'annexation' | 'client' | 'control' | 'contested'),
// title, geometry promise, precision, source, optional note. Order matters only for display.
const front = (year, prefix) => WW2_MOMENTS.find((m) => m.year === year).fronts.find((f) => f.id.startsWith(prefix))
// Schematic German-occupied zone of France, 1940–1942: north and west of the demarcation line,
// generalised through towns on the line (Saint-Jean-Pied-de-Port, Langon, Angoulême, Vierzon,
// Moulins, Chalon-sur-Saône, Dole) and the Swiss border near Geneva. The zone included the whole
// Atlantic coast down to Spain.
const demarcationNorthWest = [[[[-1.24, 43.1], [-0.3, 43.9], [-0.25, 44.55], [0.0, 44.9], [0.25, 45.6], [0.67, 46.0], [0.9, 46.5], [1.0, 47.05],
  [2.07, 47.22], [2.9, 46.9], [3.33, 46.57], [4.0, 46.48], [4.85, 46.78], [5.5, 46.95], [6.05, 46.4], [8.5, 46.4], [8.5, 51.6], [-6, 51.6], [-6, 43.1], [-1.24, 43.1]]]]

async function moments() {
  const chinaSheet = sheet('1943-07-01', 'asia')
  const reich1941 = await ohm(2692712, '1941-08-01', '1945-05-08')
  const gg1939 = await ohm(2693083, '1939-10-26', '1941-08-01')
  const gg1941 = await ohm(2693084, '1941-08-01', '1945-01-19')
  const protectorate = await ohm(2704750, '1939-03-14', '1945-05-08')
  const milAdmin = await ohm(2748553, '1940-06-25', '1944-07-18')
  const ostland = await ohm(2692529, '1941', '1945')
  const rkUkraine = await ohm(2693267, '1941-09-01', '1944-11-09')
  const croatia1941 = await ohm(2692713, '1941-04-10', '1943-09-10')
  const croatia1943 = await ohm(2747830, '1943-09-10', '1945-05-15')
  const serbia = await ohm(2692357, '1941-04-22', '1944-10-22')
  const montenegroIt = await ohm(2695479, '1941-10-03', '1943-09-08')
  const montenegroDe = await ohm(2855621, '1943-09-12', '1944-12-15')
  const albania1939 = await ohm(2855615, '1939-04-12', '1941-06-07')
  const albania1941 = await ohm(2695459, '1941-06-07', '1943-09-08')
  const albaniaDe = await ohm(2800553, '1943-09-08', '1944-11-29')
  const greece = await ohm(2920398, '1941-04-30', '1944-08-26')
  const dodecanese = await ohm(2920370, '1943-09-11', '1945-05-08')
  const bulgaria1941 = await ohm(2695478, '1941-04-30', '1943-07')
  const bulgaria1943 = await ohm(2920397, '1943-07', '1944-08-26')
  const hungary1940 = await ohm(2747817, '1940-08-30', '1941-12-14')
  const hungary1941 = await ohm(2692359, '1941-12-14', '1944')
  const italy1941 = await ohm(2747829, '1941-04-18', '1942-11-11')
  const italy1942 = await ohm(2747832, '1942-11-11', '1943-09-08')
  const slovakia1939 = await ohm(2692768, '1939-04-04', '1939-11-21')
  const slovakia = await ohm(2747847, '1939-11-21', '1945-04-04')
  const reich1940 = await ohm(2704714, '1940-06-01', '1940-08-02')
  const lithuania1940 = await ohm(2848250, '1939-10-28', '1940-08-03')

  // Clip OHM regimes to land (several include territorial waters).
  const onLand = (coords, ...states) => intersection(coords, union(...states))
  const prewar = (name) => state(name, '1939-01-01')
  // CShapes spells Romania "Rumania"; without it Northern Transylvania would be clipped away.
  const europeLand = union(...['Germany (Prussia)', 'Poland', 'France', 'Italy/Sardinia', 'Yugoslavia', 'Greece', 'Albania', 'Bulgaria', 'Hungary', 'Rumania', 'Czechoslovakia', 'Lithuania', 'Latvia', 'Estonia', 'Netherlands', 'Belgium', 'Luxembourg', 'Denmark', 'Norway'].map(prewar))
  const ussr1941 = state('Russia (Soviet Union)', '1941-06-21')

  const M = {}
  // 16 September 1939 — the day before the Soviet invasion.
  M['1939-09-16'] = [
    { id: 'poland-invasion', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Westpolen · besetzter Raum während des Angriffs', en: 'Western Poland · occupied area during the invasion' },
      geometry: intersection(prewar('Poland'), box(14, 49, 20.6, 55)), source: fromMap('U.S. Army Military Review · situation on 16 September 1939', front(1939, 'warsaw').source.url),
      note: { de: 'Grobe Fläche westlich von Warschau; einzelne Widerstandsnester (z. B. Hel) sind nicht ausgespart.', en: 'Coarse area west of Warsaw; isolated pockets of resistance (e.g. Hel) are not cut out.' } },
    { id: 'protectorate', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Protektorat Böhmen und Mähren', en: 'Protectorate of Bohemia and Moravia' }, geometry: protectorate.coordinates, source: fromOhm(protectorate) },
    { id: 'slovakia', actorId: 'client', kind: 'client', precision: 'administrative', title: { de: 'Slowakischer Staat', en: 'Slovak Republic' }, geometry: slovakia1939.coordinates, source: fromOhm(slovakia1939) },
    { id: 'albania', actorId: 'italy', kind: 'occupation', precision: 'administrative', title: { de: 'Italienisch besetztes Albanien', en: 'Italian-occupied Albania' }, geometry: onLand(albania1939.coordinates, prewar('Albania')), source: fromOhm(albania1939) },
  ]
  // 4 June 1940 — Low Countries and Denmark occupied, fighting in France and northern Norway.
  const sovietPoland = difference(prewar('Poland'), reich1940.coordinates, gg1939.coordinates, lithuania1940.coordinates)
  M['1940-06-04'] = [
    { id: 'general-government', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Generalgouvernement', en: 'General Government' }, geometry: gg1939.coordinates, source: fromOhm(gg1939) },
    { id: 'poland-east', actorId: 'sovietUnion', kind: 'annexation', precision: 'administrative', title: { de: 'Ostpolen · sowjetisch besetzt und annektiert', en: 'Eastern Poland · Soviet-occupied and annexed' }, geometry: sovietPoland,
      source: fromOhm(reich1940), note: { de: 'Vorkriegspolen abzüglich der deutschen Annexionen, des Generalgouvernements und des an Litauen übergebenen Gebiets um Vilnius (alle OHM).', en: 'Pre-war Poland minus German annexations, the General Government and the Vilnius area transferred to Lithuania (all OHM).' } },
    { id: 'protectorate', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Protektorat Böhmen und Mähren', en: 'Protectorate of Bohemia and Moravia' }, geometry: protectorate.coordinates, source: fromOhm(protectorate) },
    { id: 'slovakia', actorId: 'client', kind: 'client', precision: 'administrative', title: { de: 'Slowakischer Staat', en: 'Slovak Republic' }, geometry: slovakia.coordinates, source: fromOhm(slovakia) },
    { id: 'albania', actorId: 'italy', kind: 'occupation', precision: 'administrative', title: { de: 'Italienisch besetztes Albanien', en: 'Italian-occupied Albania' }, geometry: onLand(albania1939.coordinates, prewar('Albania')), source: fromOhm(albania1939) },
    // The Vilnius area of pre-war Poland was transferred to neutral Lithuania in October 1939. It is
    // neither Polish (Allied) territory nor occupied: exclude it from Poland, ship no area for it.
    { id: 'vilnius-to-lithuania', hidden: true, geometry: intersection(prewar('Poland'), lithuania1940.coordinates) },
    { id: 'denmark', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetztes Dänemark (seit 9. April 1940)', en: 'Occupied Denmark (since 9 April 1940)' }, geometry: prewar('Denmark'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
    { id: 'low-countries', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetzte Niederlande, Belgien und Luxemburg', en: 'Occupied Netherlands, Belgium and Luxembourg' }, geometry: union(prewar('Netherlands'), prewar('Belgium'), prewar('Luxembourg')), source: fromMap('USHMM · German occupation maps', USHMM_MAPS),
      note: { de: 'Kapitulation der Niederlande am 15. Mai, Belgiens am 28. Mai 1940.', en: 'The Netherlands capitulated on 15 May, Belgium on 28 May 1940.' } },
    { id: 'norway-south', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Süd- und Mittelnorwegen · besetzt', en: 'Southern and central Norway · occupied' }, geometry: intersection(prewar('Norway'), box(4, 57, 32, 66)), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
    { id: 'norway-north', actorId: 'naziGermany', kind: 'contested', precision: 'schematic', title: { de: 'Nordnorwegen · Kämpfe bis 10. Juni 1940', en: 'Northern Norway · fighting until 10 June 1940' }, geometry: intersection(prewar('Norway'), box(4, 66, 32, 72)), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
    { id: 'france-north', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Nordfrankreich · nördlich von Somme und Aisne', en: 'Northern France · north of the Somme and Aisne' },
      geometry: intersection(prewar('France'), [[[[-5, 49.8], ...front(1940, 'sommes').line, [8, 49.5], [8, 52], [-5, 52], [-5, 49.8]]]]), source: fromMap('U.S. Military Academy · Western Front, 4 June 1940', front(1940, 'sommes').source.url) },
  ]
  // 12 November 1941 and 18 November 1942 share the Balkan and Western European regimes.
  const west = (date) => {
    const occupiedFrance = difference(intersection(prewar('France'), demarcationNorthWest), milAdmin.coordinates, reich1941.coordinates)
    return [
      { id: 'norway', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetztes Norwegen', en: 'Occupied Norway' }, geometry: prewar('Norway'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
      { id: 'denmark', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetztes Dänemark', en: 'Occupied Denmark' }, geometry: prewar('Denmark'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
      { id: 'netherlands', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetzte Niederlande', en: 'Occupied Netherlands' }, geometry: prewar('Netherlands'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
      { id: 'belgium-north-france', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Militärverwaltung Belgien und Nordfrankreich', en: 'Military Administration in Belgium and Northern France' }, geometry: milAdmin.coordinates, source: fromOhm(milAdmin) },
      date === '1941-11-12'
        ? { id: 'france-occupied-zone', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Besetzte Zone Frankreichs (bis zur Demarkationslinie)', en: 'Occupied zone of France (up to the demarcation line)' }, geometry: occupiedFrance, source: fromMap('USHMM · German occupation maps', USHMM_MAPS),
          note: { de: 'Die Demarkationslinie ist über Orte auf der Linie verallgemeinert; die Zone umfasste die ganze Atlantikküste bis Spanien.', en: 'The demarcation line is generalised through towns on the line; the zone included the whole Atlantic coast down to Spain.' } }
        : { id: 'france', actorId: 'axisJoint', kind: 'occupation', precision: 'administrative', title: { de: 'Frankreich · seit 11. November 1942 vollständig besetzt', en: 'France · fully occupied since 11 November 1942' },
          geometry: difference(prewar('France'), milAdmin.coordinates, reich1941.coordinates, italy1942.coordinates), source: fromMap('USHMM · German occupation maps', USHMM_MAPS),
          note: { de: 'Deutsch und – östlich der Rhône – italienisch besetzt; die Zonengrenze ist hier nicht unterschieden. Korsika ist italienisch besetzt.', en: 'Occupied by Germany and, east of the Rhône, by Italy; the zone boundary is not distinguished here. Corsica is Italian-occupied.' } },
    ]
  }
  const balkans = (date) => {
    const italy = date === '1941-11-12' ? italy1941 : italy1942
    const hungary = date === '1941-11-12' ? hungary1940 : hungary1941
    return [
      { id: 'croatia', actorId: 'client', kind: 'client', precision: 'administrative', title: { de: 'Unabhängiger Staat Kroatien', en: 'Independent State of Croatia' }, geometry: onLand(croatia1941.coordinates, europeLand), source: fromOhm(croatia1941) },
      { id: 'serbia', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Gebiet des Militärbefehlshabers in Serbien', en: 'Territory of the Military Commander in Serbia' }, geometry: serbia.coordinates, source: fromOhm(serbia) },
      { id: 'montenegro', actorId: 'italy', kind: 'occupation', precision: 'administrative', title: { de: 'Italienisches Gouvernement Montenegro', en: 'Italian Governorate of Montenegro' }, geometry: onLand(montenegroIt.coordinates, europeLand), source: fromOhm(montenegroIt) },
      { id: 'albania', actorId: 'italy', kind: 'occupation', precision: 'administrative', title: { de: 'Italienisches Protektorat Albanien', en: 'Italian protectorate of Albania' }, geometry: onLand(albania1941.coordinates, europeLand), source: fromOhm(albania1941) },
      { id: 'italian-annexations', actorId: 'italy', kind: 'annexation', precision: 'administrative', title: { de: 'Von Italien annektierte Gebiete', en: 'Areas annexed by Italy' }, geometry: onLand(difference(italy.coordinates, prewar('Italy/Sardinia')), europeLand), source: fromOhm(italy),
        note: { de: 'Italien in den OHM-Grenzen des Stichtags abzüglich Vorkriegsitalien (u. a. Provinz Laibach, Dalmatien, ab Nov. 1942 Korsika).', en: 'Italy within its OHM boundary on the date minus pre-war Italy (incl. Province of Ljubljana, Dalmatia, Corsica from Nov. 1942).' } },
      { id: 'greece', actorId: 'axisJoint', kind: 'occupation', precision: 'administrative', title: { de: 'Deutsch und italienisch besetztes Griechenland', en: 'German- and Italian-occupied Greece' }, geometry: onLand(greece.coordinates, prewar('Greece')), source: fromOhm(greece) },
      { id: 'bulgarian-annexations', actorId: 'bulgaria', kind: 'annexation', precision: 'administrative', title: { de: 'Von Bulgarien besetzte und annektierte Gebiete', en: 'Areas occupied and annexed by Bulgaria' }, geometry: onLand(difference(bulgaria1941.coordinates, state('Bulgaria', '1941-01-01')), europeLand), source: fromOhm(bulgaria1941) },
      { id: 'hungarian-annexations', actorId: 'hungary', kind: 'annexation', precision: 'administrative', title: { de: 'Von Ungarn annektierte Gebiete', en: 'Areas annexed by Hungary' }, geometry: onLand(difference(hungary.coordinates, state('Hungary', '1938-01-01')), europeLand), source: fromOhm(hungary) },
      // Bačka, Baranja, Međimurje and Prekmurje: occupied by Hungary in April 1941 but formally
      // annexed only on 14 December 1941, so the OHM boundary of that date marks the area.
      ...(date === '1941-11-12' ? [{ id: 'hungarian-occupation', actorId: 'hungary', kind: 'occupation', precision: 'administrative', title: { de: 'Von Ungarn besetzte jugoslawische Gebiete', en: 'Yugoslav areas occupied by Hungary' },
        geometry: onLand(difference(hungary1941.coordinates, hungary1940.coordinates), europeLand), source: fromOhm(hungary1941),
        note: { de: 'Seit April 1941 besetzt, formell annektiert am 14. Dezember 1941; die Fläche folgt der OHM-Grenze ab diesem Tag.', en: 'Occupied since April 1941, formally annexed on 14 December 1941; the area follows the OHM boundary from that day.' } }] : []),
      { id: 'protectorate', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Protektorat Böhmen und Mähren', en: 'Protectorate of Bohemia and Moravia' }, geometry: protectorate.coordinates, source: fromOhm(protectorate) },
      { id: 'slovakia', actorId: 'client', kind: 'client', precision: 'administrative', title: { de: 'Slowakischer Staat', en: 'Slovak Republic' }, geometry: slovakia.coordinates, source: fromOhm(slovakia) },
      { id: 'general-government', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Generalgouvernement', en: 'General Government' }, geometry: gg1941.coordinates, source: fromOhm(gg1941) },
    ]
  }
  for (const [date, year] of [['1941-11-12', 1941], ['1942-11-18', 1942]]) {
    const eastern = front(year, 'east-')
    M[date] = [
      ...west(date), ...balkans(date),
      // No atlas sheet exists before July 1943. The front in China changed comparatively little between
      // 1939 and the Ichi-Go offensive of 1944, so the earliest sheet (1 July 1943) stands in, marked
      // schematic. Manchukuo is drawn separately as a client state.
      { id: 'china-japanese-occupied', actorId: 'japan', kind: 'occupation', precision: 'schematic', title: { de: 'Japanisch besetztes China', en: 'Japanese-occupied China' },
        geometry: difference(intersection(state('China', date), chinaSheet.axis), manchukuo?.coordinates ?? []), source: fromAtlas(chinaSheet),
        note: { de: 'Ausdehnung nach dem frühesten Blatt des US-Lageatlas (1. Juli 1943); die Front in China war zwischen 1939 und 1944 weitgehend erstarrt, örtliche Abweichungen (etwa Zhejiang–Jiangxi 1942) sind möglich.', en: 'Extent from the earliest sheet of the U.S. Army atlas (1 July 1943); the China front was largely static between 1939 and 1944, local differences (e.g. Zhejiang–Jiangxi 1942) are possible.' } },
      { id: 'eastern-front', actorId: 'axisEast', kind: 'occupation', precision: 'schematic', title: { de: 'Besetzte sowjetische Gebiete westlich der Front', en: 'Occupied Soviet territory west of the front' },
        // CShapes keeps pre-war Poland until 1945, so the Soviet polygon lacks the eastern Polish lands
        // annexed in 1939 (Polesia, Volhynia): include Poland, minus the GG and Reich annexations.
        geometry: difference(intersection(union(ussr1941, prewar('Poland')), westOf(eastern.line, 20)), gg1941.coordinates, reich1941.coordinates), source: fromMap(eastern.source.title, eastern.source.url),
        note: { de: 'Nur im Breitenbereich des belegten Frontabschnitts; östliche Grenze ist die schematische Frontlinie.', en: 'Only within the latitude range of the sourced front section; the eastern limit is the schematic front line.' } },
    ]
  }
  // Atlas dates: administrative regimes clipped to the digitised Axis-held area; Allied-held parts
  // of Axis or Axis-occupied territory as "control".
  const clipped = (s, coords) => intersection(coords, s.axis)
  const alliedHeld = (s, coords) => intersection(difference(coords, s.axis), s.frame)
  const atlasDate = (date, extra) => {
    const s = sheet(date)
    const src = fromAtlas(s)
    const features = [
      { id: 'protectorate', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Protektorat Böhmen und Mähren', en: 'Protectorate of Bohemia and Moravia' }, geometry: clipped(s, protectorate.coordinates), source: fromOhm(protectorate), evidence: src },
      { id: 'ostland', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Reichskommissariat Ostland', en: 'Reichskommissariat Ostland' }, geometry: clipped(s, onLand(ostland.coordinates, europeLand, ussr1941)), source: fromOhm(ostland), evidence: src },
      { id: 'netherlands', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Besetzte Niederlande', en: 'Occupied Netherlands' }, geometry: clipped(s, prewar('Netherlands')), source: src },
      { id: 'denmark', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetztes Dänemark', en: 'Occupied Denmark' }, geometry: prewar('Denmark'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
      { id: 'italy-german', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Deutsch besetztes Italien', en: 'German-occupied Italy' }, geometry: clipped(s, prewar('Italy/Sardinia')), source: src },
      // Not limited to the sheet frame: the 1944/45 sheets end near Perugia, and all of Italy south
      // of them was Allied-held.
      { id: 'italy-allied', actorId: 'westernAllies', kind: 'control', precision: 'digitized', title: { de: 'Alliiert kontrolliertes Italien', en: 'Allied-controlled Italy' }, geometry: difference(prewar('Italy/Sardinia'), s.axis), source: src },
      { id: 'croatia', actorId: 'client', kind: 'client', precision: 'digitized', title: { de: 'Unabhängiger Staat Kroatien', en: 'Independent State of Croatia' }, geometry: clipped(s, onLand(croatia1943.coordinates, europeLand)), source: fromOhm(croatia1943), evidence: src },
      { id: 'dodecanese', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Deutsch besetzter Dodekanes', en: 'German-occupied Dodecanese' }, geometry: dodecanese.coordinates, source: fromOhm(dodecanese) },
      ...extra(s, src),
    ]
    return features
  }
  M['1943-12-15'] = atlasDate('1943-12-15', (s, src) => [
    { id: 'norway', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Besetztes Norwegen', en: 'Occupied Norway' }, geometry: prewar('Norway'), source: fromMap('USHMM · German occupation maps', USHMM_MAPS) },
    { id: 'general-government', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Generalgouvernement', en: 'General Government' }, geometry: clipped(s, gg1941.coordinates), source: fromOhm(gg1941), evidence: src },
    { id: 'rk-ukraine', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Reichskommissariat Ukraine', en: 'Reichskommissariat Ukraine' }, geometry: clipped(s, onLand(rkUkraine.coordinates, ussr1941)), source: fromOhm(rkUkraine), evidence: src },
    { id: 'eastern-front', actorId: 'axisEast', kind: 'occupation', precision: 'digitized', title: { de: 'Weitere besetzte sowjetische Gebiete (Militärverwaltung)', en: 'Further occupied Soviet territory (military administration)' },
      geometry: difference(clipped(s, ussr1941), ostland.coordinates, rkUkraine.coordinates, gg1941.coordinates), source: src },
    { id: 'belgium-north-france', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Militärverwaltung Belgien und Nordfrankreich', en: 'Military Administration in Belgium and Northern France' }, geometry: milAdmin.coordinates, source: fromOhm(milAdmin) },
    { id: 'france', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Deutsch besetztes Frankreich', en: 'German-occupied France' }, geometry: difference(clipped(s, prewar('France')), milAdmin.coordinates, reich1941.coordinates), source: src },
    { id: 'serbia', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Gebiet des Militärbefehlshabers in Serbien', en: 'Territory of the Military Commander in Serbia' }, geometry: serbia.coordinates, source: fromOhm(serbia) },
    { id: 'montenegro', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Deutsch besetztes Montenegro', en: 'German-occupied Montenegro' }, geometry: onLand(montenegroDe.coordinates, europeLand), source: fromOhm(montenegroDe) },
    { id: 'albania', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Deutsch besetztes Albanien', en: 'German-occupied Albania' }, geometry: onLand(albaniaDe.coordinates, europeLand), source: fromOhm(albaniaDe) },
    { id: 'greece', actorId: 'naziGermany', kind: 'occupation', precision: 'administrative', title: { de: 'Deutsch besetztes Griechenland', en: 'German-occupied Greece' }, geometry: difference(onLand(greece.coordinates, prewar('Greece')), dodecanese.coordinates), source: fromOhm(greece) },
    { id: 'bulgarian-annexations', actorId: 'bulgaria', kind: 'annexation', precision: 'administrative', title: { de: 'Von Bulgarien besetzte und annektierte Gebiete', en: 'Areas occupied and annexed by Bulgaria' }, geometry: onLand(difference(bulgaria1943.coordinates, state('Bulgaria', '1941-01-01')), europeLand), source: fromOhm(bulgaria1943) },
    { id: 'hungarian-annexations', actorId: 'hungary', kind: 'annexation', precision: 'administrative', title: { de: 'Von Ungarn annektierte Gebiete', en: 'Areas annexed by Hungary' }, geometry: onLand(difference(hungary1941.coordinates, state('Hungary', '1938-01-01')), europeLand), source: fromOhm(hungary1941) },
    { id: 'slovakia', actorId: 'client', kind: 'client', precision: 'administrative', title: { de: 'Slowakischer Staat', en: 'Slovak Republic' }, geometry: slovakia.coordinates, source: fromOhm(slovakia) },
  ])
  const alliedGermany = (s, src) => {
    const held = alliedHeld(s, difference(reich1941.coordinates, protectorate.coordinates, gg1941.coordinates))
    // The two Allied advances do not meet on these dates; 13.5°E separates them (Western Allies at
    // most ~12.9°E near Chemnitz, the Red Army at the Oder ~14.3°E and in Vienna).
    return [
      { id: 'reich-west-allied', actorId: 'westernAllies', kind: 'control', precision: 'digitized', title: { de: 'Von den Westalliierten eingenommenes Reichsgebiet', en: 'Reich territory taken by the Western Allies' }, geometry: intersection(held, box(-5, 40, 13.5, 60)), source: src },
      { id: 'reich-east-soviet', actorId: 'sovietUnion', kind: 'control', precision: 'digitized', title: { de: 'Von der Roten Armee eingenommenes Reichsgebiet', en: 'Reich territory taken by the Red Army' }, geometry: intersection(held, box(13.5, 40, 30, 60)), source: src },
    ]
  }
  M['1944-12-15'] = atlasDate('1944-12-15', (s, src) => [
    { id: 'norway', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Besetztes Norwegen (ohne das befreite Ostfinnmark)', en: 'Occupied Norway (excluding liberated eastern Finnmark)' }, geometry: intersection(prewar('Norway'), box(4, 57, 28, 72)), source: fromMap('USHMM · German occupation maps', USHMM_MAPS),
      note: { de: 'Kirkenes wurde im Oktober 1944 von der Roten Armee befreit; der deutsche Rückzug aus der Finnmark dauerte bis Februar 1945.', en: 'Kirkenes was liberated by the Red Army in October 1944; the German withdrawal from Finnmark lasted until February 1945.' } },
    { id: 'general-government', actorId: 'naziGermany', kind: 'occupation', precision: 'digitized', title: { de: 'Generalgouvernement · westlich der Weichsel', en: 'General Government · west of the Vistula' }, geometry: clipped(s, gg1941.coordinates), source: fromOhm(gg1941), evidence: src },
    ...alliedGermany(s, src),
  ])
  M['1945-04-15'] = atlasDate('1945-04-15', (s, src) => [
    { id: 'norway', actorId: 'naziGermany', kind: 'occupation', precision: 'schematic', title: { de: 'Besetztes Norwegen · westlich der Lyngen-Linie', en: 'Occupied Norway · west of the Lyngen Line' }, geometry: intersection(prewar('Norway'), box(4, 57, 20.5, 72)), source: fromMap('USHMM · German occupation maps', USHMM_MAPS),
      note: { de: 'Nach dem Rückzug aus der Finnmark hielten deutsche Truppen die Stellung am Lyngenfjord.', en: 'After withdrawing from Finnmark, German forces held the line at the Lyngenfjord.' } },
    ...alliedGermany(s, src),
  ])
  return M
}

// ---- colour categories ------------------------------------------------------------------------
// The map colours sides, not individual powers: Axis red, Allies blue; state territory and
// annexations dark, occupation and military presence light. The individual power stays as `power`.
const CATEGORIES = {
  axisState: { actor: { de: 'Achsenmächte · Staatsgebiet & Annexionen', en: 'Axis powers · state territory & annexations' }, color: '#b91c1c' },
  axisOccupied: { actor: { de: 'Achsenmächte · Besatzung & Militärpräsenz', en: 'Axis powers · occupation & military presence' }, color: '#f87171' },
  alliedState: { actor: { de: 'Alliierte · Staatsgebiet', en: 'Allies · state territory' }, color: '#1d4ed8' },
  alliedControl: { actor: { de: 'Alliierte · Besatzung & Militärpräsenz', en: 'Allies · occupation & military presence' }, color: '#60a5fa' },
  sovietPact: { actor: { de: 'Sowjetunion (bis 22. Juni 1941 nicht alliiert)', en: 'Soviet Union (not Allied until 22 June 1941)' }, color: '#a1a1aa' },
  contested: { actor: { de: 'Umkämpft', en: 'Contested' }, color: '#f59e0b' },
}
function categoryOf(entry, date) {
  if (entry.kind === 'contested') return 'contested'
  if (entry.actorId === 'sovietUnion' && date < '1941-06-22') return 'sovietPact'
  if (entry.actorId === 'westernAllies' || entry.actorId === 'sovietUnion') return 'alliedControl'
  return entry.kind === 'annexation' || entry.kind === 'client' ? 'axisState' : 'axisOccupied'
}

// ---- state territory of every belligerent (scripts/lib/ww2-sides.mjs) ------------------------
const reichByDay = new Map(JSON.parse(gunzipSync(readFileSync('scripts/data/ww2-annexations.geojson.gz')).toString('utf8')).features
  .map((f) => [f.properties.day, f.geometry.coordinates]))
const planarArea = (coords) => coords.reduce((s, polygon) => s + polygon.reduce((t, ring, i) => {
  let a = 0
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) a += (ring[j][0] - ring[k][0]) * (ring[j][1] + ring[k][1])
  return t + (i === 0 ? Math.abs(a / 2) : -Math.abs(a / 2))
}, 0), 0)
/** Drops numerical slivers left by clipping two independently traced boundaries (< 0.02 deg²). */
const solid = (coords) => coords.filter((polygon) => planarArea([polygon]) >= 0.02)
const CSHAPES_SOURCE = { title: 'CShapes 2.0 · state borders on the map date', url: 'https://icr.ethz.ch/data/cshapes/', ...CSHAPES_LICENSE }
const manchukuo = await ohmRelation(2885965, '1932', '1945-08-17').catch((error) => { console.log(`Manchukuo skipped: ${error.message}`); return null })

function stateFeatures(date, taken) {
  const day = asNumber(date)
  const reich = reichByDay.get(day)
  if (!reich) throw new Error(`No Reich footprint for ${date}; rebuild npm run data:ww2`)
  // Every atlas sheet of this date (Europe and Asia/Pacific); the 1943-07-01 sheet is not a moment.
  const sheets = atlas.sheets.filter((x) => x.date === date).map(toSheet)
  const out = []
  const push = (id, category, kind, title, geometry, note, source = CSHAPES_SOURCE, precision = 'administrative') => {
    const g = solid(geometry)
    if (g.length) out.push({ id, category, kind, precision, title, geometry: g, source, ...(note ? { note } : {}) })
  }
  if (manchukuo && date >= '1940-09-27') {
    push('state-manchukuo', 'axisState', 'client', { de: 'Mandschukuo (japanischer Satellitenstaat)', en: 'Manchukuo (Japanese client state)' }, difference(manchukuo.coordinates, taken), null, fromOhm(manchukuo))
    taken = union(taken, manchukuo.coordinates)
  }
  for (const f of cshapes.features) {
    const p = f.properties
    if (dayOf(p, 'gws') > day || dayOf(p, 'gwe') < day) continue
    const role = roleOf(p.cntry_name, date)
    if (!role) continue
    const unit = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const own = p.cntry_name === 'Germany (Prussia)' ? reich : difference(unit, reich)
    // A unit swallowed by the Reich (Austria) leaves only boundary slivers. Test this before removing
    // occupied areas: a mostly occupied state (France 1943: liberated Corsica only) must stay.
    if (planarArea(own) < planarArea(unit) * 0.03 && p.cntry_name !== 'Germany (Prussia)') continue
    let base = difference(own, taken)
    const id = `state-${p.cntry_name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`
    const title = unitTitle(p.cntry_name)
    const reason = reasonOf(p.cntry_name, date)
    const note = reason ? { de: `Seitenzuordnung: ${reason}.`, en: `Side: ${reason}.` } : null
    if (role === 'axis' || role === 'allied') {
      // Split by the atlas sheets: the part held by the other side on this date gets that side's
      // light colour (e.g. Japanese-occupied China, Soviet-held Hungary).
      let clipped = false
      for (const s of sheets) {
        const otherSide = role === 'axis' ? intersection(difference(base, s.axis), s.frame) : intersection(base, s.frame, s.axis)
        const lost = solid(otherSide)
        if (!lost.length) continue
        push(`${id}-held-by-${role === 'axis' ? 'allies' : 'axis'}-${s.region}`, role === 'axis' ? 'alliedControl' : 'axisOccupied', role === 'axis' ? 'control' : 'occupation',
          { de: `${title.de} · ${role === 'axis' ? 'von den Alliierten gehalten' : 'von der Achse gehalten'}`, en: `${title.en} · held by the ${role === 'axis' ? 'Allies' : 'Axis'}` }, lost, null, fromAtlas(s), 'digitized')
        base = difference(base, lost)
        clipped = true
      }
      push(id, role === 'axis' ? 'axisState' : 'alliedState', 'state', title, base, note, CSHAPES_SOURCE, clipped ? 'digitized' : 'administrative')
    } else {
      push(id, role, role === 'contested' ? 'contested' : role === 'alliedControl' ? 'control' : 'occupation', title, base, note)
    }
  }
  return out
}

// ---- assemble ---------------------------------------------------------------------------------
const M = await moments()
const dates = WW2_MOMENTS.map((m) => m.date)
const snapshots = []
for (const date of dates) {
  const entries = M[date]
  if (!entries) throw new Error(`No occupation entries for ${date}`)
  const features = []
  let taken = []
  for (const e of entries) {
    if (!e.geometry?.length) { console.log(`  ${date} ${e.id}: empty after clipping (not shipped)`); continue }
    if (e.hidden) { taken = union(taken, e.geometry); continue } // excluded from state areas, not shown
    const category = categoryOf(e, date)
    features.push({ ...e, actorId: category, power: ACTORS[e.actorId].actor, geometry: { type: 'MultiPolygon', coordinates: forSphere(e.geometry) } })
    taken = union(taken, e.geometry)
  }
  // Specific areas first: clicks pick the first match, and state areas exclude them anyway.
  for (const f of stateFeatures(date, taken)) {
    features.push({ id: f.id, actorId: f.category, kind: f.kind, precision: f.precision, title: f.title, ...(f.note ? { note: f.note } : {}), source: f.source, geometry: { type: 'MultiPolygon', coordinates: forSphere(f.geometry) } })
  }
  snapshots.push({ date, features })
  const counts = Object.keys(CATEGORIES).map((c) => `${c} ${features.filter((f) => f.actorId === c).length}`).join(', ')
  console.log(`${date}: ${features.length} areas (${counts})`)
}
writeFileSync('scripts/data/ww2-occupation.json', JSON.stringify({ schemaVersion: 2, actors: CATEGORIES, cshapesSha256: cshapesHash, snapshots }))
console.log('Wrote scripts/data/ww2-occupation.json')
