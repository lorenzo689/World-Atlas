// Digitises the European sheets of the U.S. Army "Atlas of the World Battle Fronts in Semimonthly
// Phases" (public domain, U.S. federal government work) into Axis-held areas and front lines.
//
//   npm run data:ww2:atlas        (downloads the pinned sheets once into scripts/source/historical/atlas/)
//
// Method, step by step:
//  1. Georeference: ground control points (city markers, scripts/source/ww2-atlas-gcps.json) are
//     projected with a conic equal-area projection; an affine transform maps pixels to that plane.
//     Outliers are removed; the leave-one-out error is the reported positional uncertainty.
//  2. Classify every pixel by the atlas colour key: white = Axis-held, pink / dark red = Allied-held
//     (dark red = gained in the last half month), grey = neutral, blue-green = sea. Text, rivers and
//     borders are unclassified and take the class of the nearest classified land pixel.
//  3. Clean up: white arrows drawn inside Allied areas are removed (small Axis islands enclosed by
//     Allied land). Real pockets on a coast (e.g. Dunkirk) touch the sea and are kept.
//  4. Vectorise the Axis-held mask (d3-contour) and transform it to longitude/latitude.
//  5. Front lines are the parts of that outline that run over land and have Allied area on the other
//     side (not neutral countries, not the sheet edge, not coastlines).
//
// Output: scripts/data/ww2-atlas.json, consumed by build-territories.mjs and build-ww2-fronts.mjs.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { contours } from 'd3-contour'
import { geoConicEqualArea, geoContains, geoDistance, geoMercator } from 'd3-geo'
import polygonClipping from 'polygon-clipping'
import { feature } from 'topojson-client'

// Europe sheets use a conic projection, Asia/Pacific sheets Mercator (chosen by the smallest
// leave-one-out error among candidate projections). `insets` are pixel rectangles of enlarged
// detail maps at another scale (Leyte, Okinawa, New Georgia); they carry no data for the main map.
// The Asia sheet of 1943-07-01 is the earliest of the series; it stands in, as a documented
// schematic source, for Japanese-occupied China on the 1941 and 1942 dates (no app fronts).
const CONIC = { name: 'conic equal-area, central meridian 20°E, parallels 40°/60°', projection: geoConicEqualArea().rotate([-20, 0]).parallels([40, 60]).scale(1).translate([0, 0]) }
const MERCATOR = { name: 'Mercator', projection: geoMercator().scale(1).translate([0, 0]) }
const SHEETS = [
  { date: '1943-12-15', region: 'europe', file: '1943-12-15GerWW2BattlefrontAtlas.jpg', sha256: '59fee08dbcad186b724543abdfb139ac04cccfdce7ed5e2c24abcb9050ffaafe', ...CONIC },
  { date: '1944-12-15', region: 'europe', file: '1944-12-15GerWW2BattlefrontAtlas.jpg', sha256: '2bbab9f29fb4b562bb9fdddedab0f4b246eed9baf4ddab398cc862554360d7d4', ...CONIC },
  { date: '1945-04-15', region: 'europe', file: '1945-04-15GerWW2BattlefrontAtlas.jpg', sha256: '8a55aad2df81f82ad7e00ad86a3b439470882b6a5e44323c0711fd579f1cfdfe', ...CONIC },
  { date: '1943-07-01', region: 'asia', file: '1943-07-01JapWW2BattlefrontAtlas.jpg', sha256: '112020516739e510bcd8f14aa0cf4436cc4776320a3025fb14844e9cfd78e1c5', insets: [[0, 885, 225, 1180]], ...MERCATOR },
  { date: '1943-12-15', region: 'asia', file: '1943-12-15JapWW2BattlefrontAtlas.jpg', sha256: 'ca75eb34c11755f63d478363f6b53be46fe8fb72251445e8ab56e5882544ee35', ...MERCATOR },
  { date: '1944-12-15', region: 'asia', file: '1944-12-15JapWW2BattlefrontAtlas.jpg', sha256: '3ee43833d5e8cd111034a561d9288b9f9f5e35c5dd4e82741256d7c732b60059', insets: [[0, 878, 282, 1192]], ...MERCATOR },
  { date: '1945-04-15', region: 'asia', file: '1945-04-15JapWW2BattlefrontAtlas.jpg', sha256: '4927e99f52ad431caf3921e63c5db72ad0d737a9b1c60e3a71c8c1366059c3f3', insets: [[0, 890, 268, 1190]], ...MERCATOR },
]
const gcpKey = (sheet) => (sheet.region === 'asia' ? `asia-${sheet.date}` : sheet.date)
const CACHE = 'scripts/source/historical/atlas'
const commonsUrl = (file) => {
  const md5 = createHash('md5').update(file).digest('hex')
  return `https://upload.wikimedia.org/wikipedia/commons/${md5[0]}/${md5.slice(0, 2)}/${file}`
}
const pageUrl = (file) => `https://commons.wikimedia.org/wiki/File:${file}`
const EARTH_KM = 6371

// ---- 1. georeference ---------------------------------------------------------------------------
function solve(A, b) {
  const n = A[0].length
  const M = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)), A.reduce((s, r, k) => s + r[i] * b[k], 0)])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] }
  }
  return M.map((row, i) => row[n] / row[i])
}
const km = (a, b) => geoDistance(a, b) * EARTH_KM
/** Affine pixel -> projected plane; returns pixel -> [lon, lat] and lon/lat -> pixel. */
function affine(points, projection) {
  const A = points.map(([, x, y]) => [1, x, y])
  const P = points.map(([, , , lat, lon]) => projection([lon, lat]))
  const ax = solve(A, P.map((p) => p[0])), ay = solve(A, P.map((p) => p[1]))
  const toLonLat = (x, y) => projection.invert([ax[0] + ax[1] * x + ax[2] * y, ay[0] + ay[1] * x + ay[2] * y])
  const det = ax[1] * ay[2] - ax[2] * ay[1]
  const toPixel = (lon, lat) => {
    const [u, v] = projection([lon, lat])
    const du = u - ax[0], dv = v - ay[0]
    return [(du * ay[2] - dv * ax[2]) / det, (dv * ax[1] - du * ay[1]) / det]
  }
  // Projected x without longitude wrapping: lets callers find pixels east of 180° (Asia sheets reach
  // Midway at 177°W), where the inverse projection would jump to -180° and tear polygons apart.
  const beyondAntimeridian = (x, y) => ax[0] + ax[1] * x + ax[2] * y > projection([179.9, 0])[0]
  return { toLonLat, toPixel, beyondAntimeridian }
}
function georeference(gcps, projection) {
  let points = [...gcps]
  const dropped = []
  for (;;) {
    const model = affine(points, projection)
    const res = points.map(([, x, y, lat, lon]) => km(model.toLonLat(x, y), [lon, lat]))
    const median = [...res].sort((a, b) => a - b)[Math.floor(res.length / 2)]
    const worst = res.indexOf(Math.max(...res))
    if (res[worst] > Math.max(15, 3 * median) && points.length > 12) { dropped.push(points[worst][0]); points.splice(worst, 1); continue }
    const loo = points.map((p, i) => km(affine(points.filter((_, j) => j !== i), projection).toLonLat(p[1], p[2]), [p[4], p[3]]))
    const rms = (r) => Math.round(Math.sqrt(r.reduce((s, v) => s + v * v, 0) / r.length) * 10) / 10
    return { model, used: points.length, dropped, rmsKm: rms(res), looRmsKm: rms(loo) }
  }
}

// ---- 2./3. classify ------------------------------------------------------------------------------
const AXIS = 1, ALLIED = 2, NEUTRAL = 3, SEA = 4, NODATA = 5, UNKNOWN = 0
function classify(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (r > 120 && g < 90 && b < 90 && r - g > 70) return ALLIED // dark red: gained in the last period
  if (min >= 236 && max - min <= 12 && g - r < 6 && b - r < 6) return AXIS // white
  if (min >= 175 && (g - r >= 6 || b - r >= 6)) return SEA // light blue-green
  if (r >= 165 && r - g >= 18 && r - b >= 18) return ALLIED // pink
  if (max - min <= 16 && max <= 215 && min >= 115) return NEUTRAL // grey
  return UNKNOWN // text, rivers, borders, arrows' outlines
}
async function classified(path, insets = [], noData = () => false) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const raw = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) raw[i] = classify(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])
  // Inset maps show another place at another scale: no data for the main map.
  for (const [x0, y0, x1, y1] of insets) for (let y = y0; y < Math.min(y1, H); y++) for (let x = x0; x < Math.min(x1, W); x++) raw[y * W + x] = NODATA
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (noData(x, y)) raw[y * W + x] = NODATA
  // Multi-source BFS: unknown and sea pixels take the class of the nearest land pixel.
  const filled = new Uint8Array(raw)
  const queue = new Int32Array(W * H)
  let head = 0, tail = 0
  for (let i = 0; i < W * H; i++) {
    if (raw[i] === SEA) filled[i] = UNKNOWN
    if (filled[i] !== UNKNOWN && filled[i] !== NODATA) queue[tail++] = i
  }
  while (head < tail) {
    const i = queue[head++], x = i % W, y = (i - x) / W
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j >= 0 && filled[j] === UNKNOWN) { filled[j] = filled[i]; queue[tail++] = j }
    }
  }
  // Remove small islands of one class enclosed by the other that never touch the sea:
  //  - Axis islands inside Allied area are the white advance arrows (real coastal pockets such as
  //    Dunkirk touch the sea and survive; large encircled pockets such as the Ruhr exceed the size);
  //  - Allied specks inside Axis area are JPEG colour fringes on black border lines.
  // Open sea = large connected sea areas. Lakes are small; on these sheets they are drawn almost
  // white and must not make an inland island look like a coastal pocket.
  const openSea = new Uint8Array(W * H)
  {
    const seen = new Uint8Array(W * H)
    for (let s = 0; s < W * H; s++) {
      if (raw[s] !== SEA || seen[s]) continue
      const comp = [s]
      seen[s] = 1
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % W, y = (i - x) / W
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j >= 0 && raw[j] === SEA && !seen[j]) { seen[j] = 1; comp.push(j) }
        }
      }
      if (comp.length >= 20000) for (const i of comp) openSea[i] = 1
    }
  }
  // `member` decides which classes form the component; `other` is the class it must be enclosed by.
  const removeIslands = (member, other, maxSize) => {
    const seen = new Uint8Array(W * H)
    let count = 0
    for (let s = 0; s < W * H; s++) {
      if (!member(filled[s]) || seen[s]) continue
      const comp = [s]
      seen[s] = 1
      let keep = false
      for (let k = 0; k < comp.length && comp.length < maxSize; k++) {
        const i = comp[k], x = i % W, y = (i - x) / W
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) keep = true
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j < 0) continue
          if (openSea[j]) keep = true
          else if (member(filled[j])) { if (!seen[j]) { seen[j] = 1; comp.push(j) } }
          else if (filled[j] !== other) keep = true
        }
      }
      if (!keep && comp.length < maxSize) { for (const i of comp) filled[i] = other; count++ }
    }
    return count
  }
  // White arrows, city markers and labels inside Allied areas are white + grey islands of at most
  // ~300 px. Encircled pockets are larger (Ruhr remnant and Harz on 15 April 1945: 700+ px) and stay.
  const removed = removeIslands((c) => c === AXIS || c === NEUTRAL, ALLIED, 450)
  // Colour fringes of black lines are a mix of "pink" and "grey" pixels; remove them together.
  const specks = removeIslands((c) => c === ALLIED || c === NEUTRAL, AXIS, 400)
  // Size of the same-class area each pixel belongs to. A front must face a substantial Allied area,
  // and only a substantial grey area is a neutral country: labels, rivers and line fringes leave
  // small Allied or grey islands behind (the Oder river line would otherwise read as "neutral").
  const areaSize = new Int32Array(W * H)
  for (let s = 0; s < W * H; s++) {
    if ((filled[s] !== ALLIED && filled[s] !== NEUTRAL) || areaSize[s]) continue
    const cls = filled[s]
    const comp = [s]
    areaSize[s] = -1
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % W, y = (i - x) / W
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && filled[j] === cls && !areaSize[j]) { areaSize[j] = -1; comp.push(j) }
      }
    }
    for (const i of comp) areaSize[i] = comp.length
  }
  return { W, H, raw, filled, removed, specks, areaSize }
}

// ---- land test (modern Natural Earth coastline is adequate at this precision) --------------------
const topo = JSON.parse(readFileSync('public/data/boundaries.json', 'utf8'))
const land = feature(topo, topo.objects.countries).features.map((f) => {
  let w = 180, s = 90, e = -180, n = -90
  const visit = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]) } else c.forEach(visit) }
  visit(f.geometry.coordinates)
  return { f, box: [w, s, e, n] }
})
const onLand = ([lon, lat]) => land.some(({ f, box }) => lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3] && geoContains(f, [lon, lat]))
/** Inland by at least ~4 km in every direction, so coastlines never count as fronts. */
const inland = ([lon, lat]) => {
  const d = 0.04, k = d / Math.cos((lat * Math.PI) / 180)
  return [[0, 0], [k, 0], [-k, 0], [0, d], [0, -d]].every(([dx, dy]) => onLand([lon + dx, lat + dy]))
}

// ---- simplification ------------------------------------------------------------------------------
function douglasPeucker(points, tolerance, dist) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let best = -1, index = -1
    for (let i = a + 1; i < b; i++) { const d = dist(points[i], points[a], points[b]); if (d > best) { best = d; index = i } }
    if (best > tolerance) { keep[index] = 1; stack.push([a, index], [index, b]) }
  }
  return points.filter((_, i) => keep[i])
}
const pixelDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
const round = (v) => Math.round(v * 1000) / 1000

// Areas without any land front on these dates. Detections there come from lakes drawn almost white
// or from the sheet margin. Each entry names the historical fact it relies on, so it can be reviewed.
const NO_FRONT = [
  { box: [-11, 49.8, 2, 61], from: '1943-12-15', reason: 'British Isles: no land fighting in the Second World War' },
  { box: [-20, 20, 40, 37.5], from: '1943-12-15', reason: 'North Africa: Axis forces in Tunisia surrendered on 13 May 1943' },
  { box: [6.1, 46.2, 6.95, 46.55], from: '1943-12-15', reason: 'Lake Geneva: lake surface between France and neutral Switzerland' },
  { box: [-2, 42, 6.9, 44.2], from: '1944-12-15', reason: 'French Mediterranean coast west of the Alps: liberated in August 1944 (Operation Dragoon)' },
  { box: [87, 42.3, 126, 54], from: '1943-07-01', reason: "Mongolian border: the Mongolian People's Republic was not at war with Japan until 9 August 1945" },
]
/** Splits a line into the parts outside every applicable NO_FRONT box; returns kept parts and the removed rules. */
function applyNoFront(date, line) {
  let parts = [line]
  const hits = []
  for (const rule of NO_FRONT) {
    if (date < rule.from) continue
    const [w, s, e, n] = rule.box
    const inside = ([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n
    const next = []
    for (const part of parts) {
      let run = []
      for (const p of part) {
        if (inside(p)) { if (run.length >= 2) next.push(run); if (run.length || !hits.includes(rule)) hits.push(rule); run = [] } else run.push(p)
      }
      if (run.length >= 2) next.push(run)
    }
    parts = next
  }
  return { parts, hits: [...new Set(hits)] }
}
const lengthKm = (line) => line.slice(1).reduce((s, p, i) => s + km(line[i], p), 0)

// ---- main ----------------------------------------------------------------------------------------
mkdirSync(CACHE, { recursive: true })
const gcpData = JSON.parse(readFileSync('scripts/source/ww2-atlas-gcps.json', 'utf8')).sheets
const output = []
for (const sheet of SHEETS) {
  const path = `${CACHE}/${sheet.file}`
  if (!existsSync(path)) {
    const response = await fetch(commonsUrl(sheet.file), { headers: { 'User-Agent': 'WorldExplorerAtlasBuild/1.0 (educational project)' } })
    if (!response.ok) throw new Error(`Download failed for ${sheet.file}: ${response.status}`)
    writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  }
  const sha = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (sha !== sheet.sha256) throw new Error(`${sheet.file} changed (sha256 ${sha}); review before rebuilding`)

  const geo = georeference(gcpData[gcpKey(sheet)].gcps, sheet.projection)
  const { W, H, raw, filled, removed, specks, areaSize } = await classified(path, sheet.insets, sheet.region === 'asia' ? geo.model.beyondAntimeridian : undefined)
  const inInset = (x, y, margin) => (sheet.insets ?? []).some(([x0, y0, x1, y1]) => x >= x0 - margin && x <= x1 + margin && y >= y0 - margin && y <= y1 + margin)
  const toLonLat = ([x, y]) => geo.model.toLonLat(x, y).map(round)

  // 4. vectorise the Axis-held mask. d3-contour treats values >= threshold as inside.
  const values = Array.from(filled, (c) => (c === AXIS ? 1 : 0))
  const [mask] = contours().size([W, H]).thresholds([0.5])(values)
  const axisHeld = mask.coordinates
    .map((polygon) => polygon.map((ring) => douglasPeucker(ring, 1, pixelDist).map(toLonLat)))
    .filter((polygon) => polygon[0].length >= 4)
  // d3-contour rings are in image orientation; GeoJSON on a sphere needs the exterior clockwise in
  // lon/lat (d3-geo convention). Flipping y (image down = south) reverses the orientation, so reverse.
  for (const polygon of axisHeld) for (const ring of polygon) ring.reverse()

  // 5. fronts: walk each outline, keep vertices on land with Allied pixels close by.
  const MIN_AREA = 1500 // px; smaller Allied or grey islands are print artefacts (labels, rivers)
  const near = (x, y, cls, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const i = yy * W + xx
      if (filled[i] === cls && areaSize[i] >= MIN_AREA) return true
    }
    return false
  }
  const fronts = []
  const excludedLines = []
  for (const polygon of mask.coordinates) for (const ring of polygon) {
    let run = []
    const flush = () => {
      if (run.length >= 2) {
        const line = douglasPeucker(run.map(toLonLat), 2 / EARTH_KM, (p, a, b) => {
          const pa = km(p, a), pb = km(p, b), ab = km(a, b)
          if (ab === 0) return pa / EARTH_KM
          const s = (pa + pb + ab) / 2, area = Math.sqrt(Math.max(0, s * (s - pa) * (s - pb) * (s - ab)))
          return (2 * area) / ab / EARTH_KM
        })
        const { parts, hits } = applyNoFront(sheet.date, line)
        const keptKm = parts.reduce((t, part) => t + lengthKm(part), 0)
        if (hits.length && lengthKm(line) - keptKm >= 25) excludedLines.push({ reason: hits.map((h) => h.reason).join('; '), km: Math.round(lengthKm(line) - keptKm) })
        // A line shorter than twice the sheet's positional error cannot be told apart from noise.
        for (const part of parts) if (lengthKm(part) >= Math.max(25, 2 * geo.looRmsKm)) fronts.push(part)
      }
      run = []
    }
    for (const [x, y] of ring) {
      const edge = x < 15 || y < 15 || x > W - 15 || y > H - 15 || inInset(x, y, 15)
      const front = !edge && near(x, y, ALLIED, 2) && !near(x, y, NEUTRAL, 2) && inland(toLonLat([x, y]))
      if (front) run.push([x, y])
      else flush()
    }
    flush()
  }
  // The sheet frame in lon/lat (densified, so its curved outline is represented faithfully),
  // minus the inset maps, which carry no data for the main map.
  const box = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  const toFrame = (ring) => {
    const dense = []
    for (let i = 0; i < ring.length - 1; i++) for (let t = 0; t < 20; t++) dense.push([ring[i][0] + ((ring[i + 1][0] - ring[i][0]) * t) / 20, ring[i][1] + ((ring[i + 1][1] - ring[i][1]) * t) / 20])
    dense.push(ring[0])
    return dense.map(toLonLat)
  }
  let east = W - 4
  while (sheet.region === 'asia' && east > 4 && [4, H / 2, H - 4].some((y) => geo.model.beyondAntimeridian(east, y))) east--
  const frame = polygonClipping.difference([[toFrame(box([4, 4, east, H - 4]))]], ...(sheet.insets ?? []).map((r) => [[toFrame(box(r))]]))
  const extent = frame.map((polygon) => polygon.map((ring) => [...ring].reverse()))
  if (process.argv.includes('--debug')) {
    // Review overlay: Axis-held outline (blue) and detected fronts (green) on the original sheet.
    const px = (p) => geo.model.toPixel(p[0], p[1]).map((v) => v.toFixed(1)).join(',')
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      axisHeld.map((poly) => poly.map((ring) => `<polyline points="${ring.map(px).join(' ')}" fill="none" stroke="#0050ff" stroke-width="1"/>`).join('')).join('') +
      fronts.map((line) => `<polyline points="${line.map(px).join(' ')}" fill="none" stroke="#00b000" stroke-width="3"/>`).join('') + '</svg>'
    mkdirSync('perf-results', { recursive: true })
    await sharp(path).composite([{ input: Buffer.from(svg) }]).png().toFile(`perf-results/ww2-atlas-${sheet.region}-${sheet.date}.png`)
  }
  const counts = [AXIS, ALLIED, NEUTRAL, SEA, UNKNOWN].map((c) => raw.filter((v) => v === c).length)
  console.log(`${sheet.region} ${sheet.date}: ${geo.used} GCPs (dropped ${geo.dropped.join(', ') || 'none'}), RMS ${geo.rmsKm} km, leave-one-out ${geo.looRmsKm} km; ` +
    `pixels axis/allied/neutral/sea/other ${counts.join('/')}; ${removed} arrow islands, ${specks} colour specks removed; ${axisHeld.length} Axis polygons; ${fronts.length} front lines, ${Math.round(fronts.reduce((s, l) => s + lengthKm(l), 0))} km; ` +
    `excluded ${excludedLines.map((l) => `${l.km} km (${l.reason.split(':')[0]})`).join(', ') || 'none'}`)
  output.push({
    date: sheet.date,
    region: sheet.region,
    source: { title: 'U.S. Army · Atlas of the World Battle Fronts in Semimonthly Phases', page: pageUrl(sheet.file), sha256: sheet.sha256, license: 'Public domain (U.S. federal government work)' },
    georeference: { projection: `${sheet.name}, affine fit`, gcps: geo.used, dropped: geo.dropped, rmsKm: geo.rmsKm, looRmsKm: geo.looRmsKm },
    excludedFrontDetections: excludedLines,
    extent: { type: 'MultiPolygon', coordinates: extent },
    axisHeld: { type: 'MultiPolygon', coordinates: axisHeld },
    fronts,
  })
}
// Front lines for the app (src/lib/ww2.ts imports them), named by region of their midpoint. Only
// the WWII moment dates; the 1943-07-01 sheet is used for areas only.
const MOMENT_DATES = ['1943-12-15', '1944-12-15', '1945-04-15']
const region = (sheetRegion, [lon, lat]) => sheetRegion === 'asia'
  ? (lon < 100 ? 'burma' : lat > 15 && lon < 123 ? 'china' : 'pacific')
  : lat > 60 ? 'finland' : lon >= 20 && lat >= 46.5 ? 'east' : lat >= 46.5 ? 'west' : lon < 7.6 ? 'alps' : lon < 13.9 && lat < 46.5 ? 'italy' : 'balkans'
const appFronts = Object.fromEntries(MOMENT_DATES.map((date) => {
  const sheets = output.filter((s) => s.date === date)
  return [date, {
    sheets: Object.fromEntries(sheets.map((s) => [s.region, { uncertaintyKm: s.georeference.looRmsKm, page: s.source.page }])),
    lines: sheets.flatMap((s) => s.fronts.map((line) => ({ sheet: s.region, region: region(s.region, line[Math.floor(line.length / 2)]), line: line.map(([lon, lat]) => [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100]) })))
      .sort((a, b) => a.region.localeCompare(b.region) || b.line.length - a.line.length),
  }]
}))
writeFileSync('src/lib/ww2-atlas-fronts.json', JSON.stringify(appFronts))
mkdirSync('scripts/data', { recursive: true })
writeFileSync('scripts/data/ww2-atlas.json', JSON.stringify({ schemaVersion: 1, method: 'Georeferenced colour classification of the U.S. Army battle-front atlas; see scripts/build-ww2-atlas.mjs', sheets: output }))
console.log('Wrote scripts/data/ww2-atlas.json')
