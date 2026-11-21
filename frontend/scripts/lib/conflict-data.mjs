// Validation of the generated present-day conflict data (scripts/build-conflict-lines.mjs):
//
//   public/data/conflict-lines.json     VIINA settlement-control boundary lines
//   public/data/territories-today.json  controller polygons from the same build
//
// Both files come from one upstream download and are only ever accepted or replaced as a pair.
// validateConflictData is deterministic: the result depends only on the two documents, the
// reference date `today` and, for a refresh, the previously verified snapshot (`baseline`).
import polygonClipping from 'polygon-clipping'

export const CONFLICT_FILES = ['public/data/conflict-lines.json', 'public/data/territories-today.json']

/** Generous envelope around Ukraine (22.1–40.2°E, 44.4–52.4°N); anything outside is not this dataset. */
export const UKRAINE_BBOX = [21.5, 44, 41, 53]
/** VIINA observations start with the full-scale invasion. */
export const EARLIEST_DATE = '2022-02-24'
/** A refresh may change the data, but not by orders of magnitude within one week. */
export const MAX_CHANGE_RATIO = 2
export const MIN_LINES = 20

const ACTORS = {
  RU: { color: '#fb7185', kind: 'occupation', required: true },
  UA: { color: '#38bdf8', kind: 'control', required: true },
  CONTESTED: { color: '#fbbf24', kind: 'contested', required: false },
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0
const localized = (value) => isObject(value) && text(value.de) && text(value.en)
const https = (value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
export const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`) // NaN for month 13; 2026-02-30 rolls over to March
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
const inBox = ([lng, lat]) => lng >= UKRAINE_BBOX[0] && lng <= UKRAINE_BBOX[2] && lat >= UKRAINE_BBOX[1] && lat <= UKRAINE_BBOX[3]
const position = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))
/** Signed planar area: positive for the outer rings the build emits, negative for holes. */
const ringArea = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2
}
const multiArea = (polygons) => polygons.reduce((sum, polygon) => sum + polygon.reduce((s, ring, i) => s + (i ? -Math.abs(ringArea(ring)) : Math.abs(ringArea(ring))), 0), 0)
const polygonsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)

function checkLines(doc, today, fail) {
  if (!isObject(doc)) return fail('conflict-lines.json: not a JSON object')
  if (doc.schemaVersion !== 1) fail(`conflict-lines.json: schemaVersion ${doc.schemaVersion}, expected 1`)
  if (doc.conflictId !== 'ukraine') fail('conflict-lines.json: conflictId must be "ukraine"')
  if (doc.type !== 'estimated-control-boundary') fail('conflict-lines.json: type must be "estimated-control-boundary"')
  for (const key of ['source', 'license', 'caveat']) if (!text(doc[key])) fail(`conflict-lines.json: missing ${key}`)
  for (const key of ['sourceUrl', 'licenseUrl']) if (!https(doc[key])) fail(`conflict-lines.json: ${key} must be an https URL`)
  if (!validDate(doc.asOf)) fail(`conflict-lines.json: asOf ${JSON.stringify(doc.asOf)} is not a calendar date`)
  else {
    if (doc.asOf < EARLIEST_DATE) fail(`conflict-lines.json: asOf ${doc.asOf} is before ${EARLIEST_DATE}`)
    if (doc.asOf > today) fail(`conflict-lines.json: asOf ${doc.asOf} is in the future (today ${today})`)
  }
  const hashes = doc.sourceSha256
  const keys = isObject(hashes) ? Object.keys(hashes).sort() : []
  const archive = validDate(doc.asOf) ? `control_latest_${doc.asOf.slice(0, 4)}.zip` : null
  if (keys.length !== 2 || keys[0] !== archive || keys[1] !== 'gn_UA_tess.geojson') {
    fail(`conflict-lines.json: sourceSha256 must name exactly ${archive ?? 'control_latest_<asOf year>.zip'} and gn_UA_tess.geojson`)
  }
  for (const key of keys) if (!/^[0-9a-f]{64}$/.test(hashes[key])) fail(`conflict-lines.json: sourceSha256 of ${key} is not a SHA-256`)
  if (!Array.isArray(doc.lines)) return fail('conflict-lines.json: lines must be an array')
  if (doc.lines.length < MIN_LINES) fail(`conflict-lines.json: only ${doc.lines.length} lines (minimum ${MIN_LINES})`)
  let bad = 0
  doc.lines.forEach((line, i) => {
    if (bad >= 5) return
    const problem = !Array.isArray(line) || line.length < 2 ? 'fewer than 2 positions'
      : !line.every(position) ? 'a non-numeric or non-finite position'
        : !line.every(inBox) ? 'a position outside the Ukraine envelope'
          : !line.every(([lng, lat]) => Number(lng.toFixed(5)) === lng && Number(lat.toFixed(5)) === lat) ? 'more than 5 decimals'
            : line.some((p, k) => k > 0 && p[0] === line[k - 1][0] && p[1] === line[k - 1][1]) ? 'repeated consecutive positions' : null
    if (problem) { bad++; fail(`conflict-lines.json: line ${i} has ${problem}`) }
  })
}

function checkGeometry(id, geometry, fail) {
  if (!isObject(geometry) || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
    fail(`territories-today.json: ${id} geometry must be a Polygon or MultiPolygon`)
    return null
  }
  const polygons = polygonsOf(geometry)
  if (!polygons.length) { fail(`territories-today.json: ${id} geometry is empty`); return null }
  for (const [p, polygon] of polygons.entries()) {
    if (!Array.isArray(polygon) || !polygon.length) { fail(`territories-today.json: ${id} polygon ${p} has no rings`); return null }
    for (const [r, ring] of polygon.entries()) {
      const where = `territories-today.json: ${id} polygon ${p} ring ${r}`
      if (!Array.isArray(ring) || ring.length < 4) { fail(`${where} has fewer than 4 positions`); return null }
      if (!ring.every(position)) { fail(`${where} has a non-numeric or non-finite position`); return null }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) { fail(`${where} is not closed`); return null }
      if (!ring.every(inBox)) { fail(`${where} leaves the Ukraine envelope`); return null }
      const area = ringArea(ring)
      if (area === 0) { fail(`${where} has zero area`); return null }
      if ((r === 0) !== (area > 0)) { fail(`${where} has ${r === 0 ? 'an outer ring' : 'a hole'} with the wrong winding`); return null }
    }
  }
  // A valid area has the same area after a union with itself; self-intersecting rings or
  // overlapping parts do not.
  let union
  try { union = polygonClipping.union(polygons) } catch (error) { fail(`territories-today.json: ${id} geometry cannot be processed (${error.message})`); return null }
  const own = multiArea(polygons)
  if (Math.abs(multiArea(union) - own) > own * 1e-6) { fail(`territories-today.json: ${id} geometry self-intersects or overlaps itself`); return null }
  return polygons
}

function checkToday(doc, lines, fail) {
  if (!isObject(doc)) return fail('territories-today.json: not a JSON object')
  if (doc.schemaVersion !== 1) fail(`territories-today.json: schemaVersion ${doc.schemaVersion}, expected 1`)
  if (JSON.stringify(doc.sourceSha256) !== JSON.stringify(lines?.sourceSha256)) fail('territories-today.json: sourceSha256 differs from conflict-lines.json (not from the same build)')
  if (!Array.isArray(doc.snapshots) || doc.snapshots.length !== 1) return fail('territories-today.json: expected exactly one snapshot')
  const snapshot = doc.snapshots[0]
  if (!isObject(snapshot)) return fail('territories-today.json: snapshot is not an object')
  const asOf = lines?.asOf
  if (snapshot.date !== asOf) fail(`territories-today.json: snapshot date ${snapshot.date} differs from conflict-lines.json asOf ${asOf}`)
  if (snapshot.id !== `ukraine-${snapshot.date}`) fail(`territories-today.json: snapshot id ${snapshot.id} does not match its date`)
  if (snapshot.scenario !== 'today') fail('territories-today.json: snapshot scenario must be "today"')
  if (!validDate(snapshot.date) || snapshot.year !== Number(snapshot.date.slice(0, 4))) fail('territories-today.json: snapshot year does not match its date')
  if (!localized(snapshot.coverage)) fail('territories-today.json: snapshot coverage must be localized (de, en)')
  if (!Array.isArray(snapshot.features)) return fail('territories-today.json: snapshot has no features')
  const areas = {}
  const seen = new Set()
  for (const feature of snapshot.features) {
    const actor = ACTORS[feature?.actorId]
    const id = feature?.id
    if (!actor) { fail(`territories-today.json: unknown actor ${JSON.stringify(feature?.actorId)}`); continue }
    if (seen.has(feature.actorId)) fail(`territories-today.json: duplicate actor ${feature.actorId}`)
    seen.add(feature.actorId)
    if (id !== `ua-${feature.actorId}`) fail(`territories-today.json: feature id ${id} does not match actor ${feature.actorId}`)
    if (!localized(feature.actor) || !localized(feature.title)) fail(`territories-today.json: ${id} actor and title must be localized`)
    if (feature.color !== actor.color || feature.kind !== actor.kind) fail(`territories-today.json: ${id} must have color ${actor.color} and kind ${actor.kind}`)
    if (feature.precision !== 'settlement-estimate') fail(`territories-today.json: ${id} precision must be "settlement-estimate"`)
    const s = feature.source
    if (!isObject(s) || !text(s.title) || !https(s.url) || !text(s.license) || !https(s.licenseUrl) || s.date !== snapshot.date) {
      fail(`territories-today.json: ${id} source needs title, https url, license, https licenseUrl and the snapshot date`)
    }
    const polygons = checkGeometry(id, feature.geometry, fail)
    if (polygons) areas[feature.actorId] = polygons
  }
  for (const [actorId, actor] of Object.entries(ACTORS)) if (actor.required && !seen.has(actorId)) fail(`territories-today.json: missing ${actorId} area`)
  // Controller areas come from one tessellation and must not overlap.
  const ids = Object.keys(areas)
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    try {
      const overlap = multiArea(polygonClipping.intersection(areas[ids[i]], areas[ids[j]]))
      if (overlap > Math.min(multiArea(areas[ids[i]]), multiArea(areas[ids[j]])) * 1e-6) fail(`territories-today.json: ${ids[i]} and ${ids[j]} areas overlap`)
    } catch (error) { fail(`territories-today.json: cannot intersect ${ids[i]} and ${ids[j]} (${error.message})`) }
  }
  return areas
}

const actorArea = (doc, actorId) => {
  const feature = doc.snapshots[0].features.find((f) => f.actorId === actorId)
  return feature ? multiArea(polygonsOf(feature.geometry)) : 0
}
const ratioOk = (value, base) => base > 0 && value > 0 && value / base <= MAX_CHANGE_RATIO && base / value <= MAX_CHANGE_RATIO

/**
 * @param {{ lines: unknown, today: unknown }} docs  parsed conflict-lines.json and territories-today.json
 * @param {{ today: string, baseline?: { lines: object, today: object } }} options  `today` as YYYY-MM-DD;
 *   `baseline` is the previously verified snapshot that a refresh would replace.
 * @returns {string[]} errors; empty when the pair is valid
 */
export function validateConflictData(docs, { today, baseline } = {}) {
  if (!validDate(today)) throw new Error(`Reference date ${today} is not YYYY-MM-DD`)
  const errors = []
  const fail = (message) => { errors.push(message) }
  checkLines(docs.lines, today, fail)
  checkToday(docs.today, docs.lines, fail)
  if (baseline && !errors.length) {
    if (docs.lines.asOf < baseline.lines.asOf) fail(`refresh: asOf ${docs.lines.asOf} is older than the verified snapshot ${baseline.lines.asOf}`)
    if (!ratioOk(docs.lines.lines.length, baseline.lines.lines.length)) {
      fail(`refresh: ${docs.lines.lines.length} lines vs. ${baseline.lines.lines.length} in the verified snapshot (allowed factor ${MAX_CHANGE_RATIO})`)
    }
    for (const actorId of ['RU', 'UA']) {
      const value = actorArea(docs.today, actorId)
      const base = actorArea(baseline.today, actorId)
      if (!ratioOk(value, base)) fail(`refresh: ${actorId} area ${value.toFixed(3)} deg² vs. ${base.toFixed(3)} deg² in the verified snapshot (allowed factor ${MAX_CHANGE_RATIO})`)
    }
  }
  return errors
}

/** Today's UTC date as YYYY-MM-DD. */
export const utcToday = (now = new Date()) => now.toISOString().slice(0, 10)
