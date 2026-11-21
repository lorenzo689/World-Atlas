// @vitest-environment node
// Positive and negative tests for the conflict data validator and the deployment-safe refresh.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONFLICT_FILES, utcToday, validateConflictData } from '../conflict-data.mjs'
import { refreshConflictData } from '../conflict-refresh.mjs'

const committed = () => ({
  lines: JSON.parse(readFileSync('public/data/conflict-lines.json', 'utf8')),
  today: JSON.parse(readFileSync('public/data/territories-today.json', 'utf8')),
})
// Pages runs these tests after a refresh, so nothing may depend on the committed values.
const TODAY = utcToday()
const BASE = committed().lines
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const OLD = '2022-03-01'
const validate = (docs, options = {}) => validateConflictData(docs, { today: TODAY, ...options })
const feature = (docs, actorId) => docs.today.snapshots[0].features.find((f) => f.actorId === actorId)
const firstRing = (docs, actorId) => feature(docs, actorId).geometry.coordinates[0][0]

/** A plausible next upstream state: a later date with new source hashes, same geometry. */
function refreshed(asOf = TODAY) {
  const docs = committed()
  const hashes = { [`control_latest_${asOf.slice(0, 4)}.zip`]: 'a'.repeat(64), 'gn_UA_tess.geojson': 'b'.repeat(64) }
  docs.lines.asOf = asOf
  docs.lines.sourceSha256 = hashes
  docs.today.sourceSha256 = hashes
  const snapshot = docs.today.snapshots[0]
  Object.assign(snapshot, { id: `ukraine-${asOf}`, date: asOf, year: Number(asOf.slice(0, 4)) })
  for (const f of snapshot.features) f.source.date = asOf
  return docs
}

describe('validateConflictData', () => {
  it('accepts the committed snapshot', () => {
    expect(validate(committed())).toEqual([])
  })

  it('accepts a valid refresh against the committed baseline', () => {
    expect(validate(refreshed(), { baseline: committed() })).toEqual([])
  })

  it('is deterministic for the same input', () => {
    const docs = committed()
    docs.lines.lines[0][0] = [99, 99]
    expect(validate(docs)).toEqual(validate(docs))
  })

  it.each([
    ['missing lines', (d) => { delete d.lines.lines }, 'lines must be an array'],
    ['too few lines', (d) => { d.lines.lines = d.lines.lines.slice(0, 3) }, 'only 3 lines'],
    ['a one-point line', (d) => { d.lines.lines[5] = [[35, 48]] }, 'line 5 has fewer than 2 positions'],
    ['a NaN coordinate', (d) => { d.lines.lines[0][0] = [Number.NaN, 48] }, 'non-numeric or non-finite'],
    ['a string coordinate', (d) => { d.lines.lines[0][0] = ['35', 48] }, 'non-numeric or non-finite'],
    ['a position outside Ukraine', (d) => { d.lines.lines[0][0] = [13.4, 52.5] }, 'outside the Ukraine envelope'],
    ['swapped lat/lng', (d) => { d.lines.lines[0] = d.lines.lines[0].map(([x, y]) => [y, x]) }, 'outside the Ukraine envelope'],
    ['a malformed date', (d) => { d.lines.asOf = '2026-02-30' }, 'is not a calendar date'],
    ['an impossible month', (d) => { d.lines.asOf = '2026-13-01' }, 'is not a calendar date'],
    ['a non-string date', (d) => { d.lines.asOf = 20261018 }, 'is not a calendar date'],
    ['a future date', (d) => { d.lines.asOf = shift(TODAY, 10) }, 'is in the future'],
    ['a date before VIINA', (d) => { d.lines.asOf = '2021-01-01' }, 'is before 2022-02-24'],
    ['a wrong schema version', (d) => { d.lines.schemaVersion = 2 }, 'schemaVersion 2'],
    ['a missing license', (d) => { delete d.lines.license }, 'missing license'],
    ['an http source URL', (d) => { d.lines.sourceUrl = 'http://github.com/zhukovyuri/VIINA' }, 'sourceUrl must be an https URL'],
    ['a malformed source hash', (d) => { d.lines.sourceSha256['gn_UA_tess.geojson'] = 'abc' }, 'is not a SHA-256'],
    ['an archive of another year', (d) => { d.lines.sourceSha256 = { [`control_latest_${Number(d.lines.asOf.slice(0, 4)) - 1}.zip`]: 'a'.repeat(64), 'gn_UA_tess.geojson': 'b'.repeat(64) } }, `sourceSha256 must name exactly control_latest_${BASE.asOf.slice(0, 4)}.zip`],
  ])('rejects conflict lines with %s', (_, mutate, message) => {
    const docs = committed()
    mutate(docs)
    expect(validate(docs).join('\n')).toContain(message)
  })

  it.each([
    ['lines and areas from different builds', (d) => { d.today.sourceSha256 = { ...d.today.sourceSha256, 'gn_UA_tess.geojson': 'c'.repeat(64) } }, 'not from the same build'],
    ['a snapshot date other than asOf', (d) => { d.today.snapshots[0].date = OLD }, 'differs from conflict-lines.json asOf'],
    ['no snapshots', (d) => { d.today.snapshots = [] }, 'expected exactly one snapshot'],
    ['a missing RU area', (d) => { d.today.snapshots[0].features = d.today.snapshots[0].features.filter((f) => f.actorId !== 'RU') }, 'missing RU area'],
    ['an unknown actor', (d) => { feature(d, 'UA').actorId = 'XX' }, 'unknown actor "XX"'],
    ['a wrong colour', (d) => { feature(d, 'RU').color = '#38bdf8' }, 'must have color #fb7185'],
    ['a wrong precision', (d) => { feature(d, 'RU').precision = 'digitized' }, 'precision must be "settlement-estimate"'],
    ['a source date other than the snapshot', (d) => { feature(d, 'UA').source.date = OLD }, 'source needs'],
    ['a non-polygon geometry', (d) => { feature(d, 'RU').geometry = { type: 'LineString', coordinates: [[35, 48], [36, 48]] } }, 'must be a Polygon or MultiPolygon'],
    ['an unclosed ring', (d) => { firstRing(d, 'RU').pop() }, 'is not closed'],
    ['a ring with too few positions', (d) => { feature(d, 'CONTESTED').geometry.coordinates[0][0] = [[35, 48], [35.1, 48], [35, 48]] }, 'fewer than 4 positions'],
    ['an infinite coordinate', (d) => { firstRing(d, 'UA')[3] = [Infinity, 48] }, 'non-numeric or non-finite'],
    ['a reversed outer ring', (d) => { firstRing(d, 'UA').reverse() }, 'outer ring with the wrong winding'],
    ['a part duplicated inside the same area', (d) => { const g = feature(d, 'RU').geometry; g.coordinates.push(g.coordinates[0]) }, 'RU geometry self-intersects or overlaps itself'],
    ['RU and UA areas that overlap', (d) => { feature(d, 'RU').geometry.coordinates.push(feature(d, 'UA').geometry.coordinates[0]) }, 'RU and UA areas overlap'],
  ])('rejects territories with %s', (_, mutate, message) => {
    const docs = committed()
    mutate(docs)
    expect(validate(docs).join('\n')).toContain(message)
  })

  it('rejects a self-intersecting (bow-tie) ring', () => {
    const docs = committed()
    feature(docs, 'CONTESTED').geometry.coordinates.push([[[35, 48], [35.4, 48.4], [35.4, 48], [35, 48.2], [35, 48]]])
    expect(validate(docs).join('\n')).toMatch(/CONTESTED (geometry self-intersects|polygon \d+ ring 0 has an outer ring with the wrong winding)/)
  })

  it.each([
    ['an older date than the verified snapshot', () => refreshed(OLD), `older than the verified snapshot ${BASE.asOf}`],
    ['a collapse of the boundary lines', () => { const d = refreshed(); d.lines.lines = d.lines.lines.slice(0, Math.floor(BASE.lines.length / 3)); return d }, `${Math.floor(BASE.lines.length / 3)} lines vs. ${BASE.lines.length}`],
    ['a collapse of the RU area', () => { const d = refreshed(); feature(d, 'RU').geometry = { type: 'Polygon', coordinates: [[[37, 47.5], [37.1, 47.5], [37.1, 47.6], [37, 47.6], [37, 47.5]]] }; return d }, 'RU area'],
  ])('rejects a refresh with %s', (_, make, message) => {
    expect(validate(make(), { baseline: committed() }).join('\n')).toContain(message)
  })
})

describe('npm run data:conflicts:verify', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'conflict-verify-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const run = (...args) => spawnSync(process.execPath, ['scripts/verify-conflict-data.mjs', '--dir', dir, '--today', TODAY, ...args], { encoding: 'utf8' })
  const write = (docs) => {
    writeFileSync(join(dir, 'conflict-lines.json'), JSON.stringify(docs.lines))
    writeFileSync(join(dir, 'territories-today.json'), JSON.stringify(docs.today))
  }

  it('passes on the committed snapshot', () => {
    write(committed())
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`VIINA as of ${BASE.asOf}, ${BASE.lines.length} boundary lines`)
  })

  it('fails on invalid geometry', () => {
    const docs = committed()
    firstRing(docs, 'RU').pop()
    write(docs)
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('is not closed')
  })

  it('fails on missing and malformed files', () => {
    expect(run().status).toBe(1)
    writeFileSync(join(dir, 'conflict-lines.json'), '{"schemaVersion": 1, "lines": [')
    writeFileSync(join(dir, 'territories-today.json'), '{}')
    const result = run()
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/conflict-lines\.json: .*JSON/)
  })
})

describe('refreshConflictData (deployment policy)', () => {
  let root
  const path = (file) => join(root, file)
  const bytes = () => CONFLICT_FILES.map((file) => readFileSync(path(file)))
  const writeDocs = (docs) => {
    writeFileSync(path(CONFLICT_FILES[0]), JSON.stringify(docs.lines))
    writeFileSync(path(CONFLICT_FILES[1]), JSON.stringify(docs.today))
  }
  const refresh = (build) => refreshConflictData({ root, build, today: TODAY })
  let original
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'conflict-refresh-'))
    mkdirSync(path('public/data'), { recursive: true })
    for (const file of CONFLICT_FILES) cpSync(file, path(file))
    writeFileSync(path('public/data/countries.json'), '{"unrelated":true}')
    original = bytes()
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))
  const expectCommitted = () => bytes().forEach((b, i) => expect(b.equals(original[i])).toBe(true))

  it('accepts a valid refreshed pair', async () => {
    const result = await refresh(async () => { writeDocs(refreshed()); return { ok: true } })
    expect(result).toEqual({ status: 'refreshed', reasons: [], asOf: TODAY, previousAsOf: BASE.asOf })
    expect(JSON.parse(readFileSync(path(CONFLICT_FILES[0]), 'utf8')).asOf).toBe(TODAY)
  })

  it('falls back to the committed snapshot when the upstream download fails', async () => {
    const result = await refresh(async () => ({ ok: false, detail: 'VIINA download failed: HTTP 404' }))
    expect(result.status).toBe('fallback')
    expect(result.reasons[0]).toContain('HTTP 404')
    expectCommitted()
  })

  it('falls back when the generator throws', async () => {
    const result = await refresh(async () => { throw new Error('ECONNRESET') })
    expect(result).toMatchObject({ status: 'fallback', asOf: BASE.asOf })
    expectCommitted()
  })

  it('restores both files when the generator fails after writing only one', async () => {
    const result = await refresh(async () => { writeFileSync(path(CONFLICT_FILES[0]), JSON.stringify(refreshed().lines)); return { ok: false, detail: 'crash' } })
    expect(result.status).toBe('fallback')
    expectCommitted()
  })

  it('falls back when the generator writes a mismatched pair and reports success', async () => {
    const result = await refresh(async () => { writeFileSync(path(CONFLICT_FILES[0]), JSON.stringify(refreshed().lines)); return { ok: true } })
    expect(result.status).toBe('fallback')
    expect(result.reasons.join('\n')).toContain('not from the same build')
    expectCommitted()
  })

  it('falls back on invalid geometry', async () => {
    const result = await refresh(async () => { const d = refreshed(); firstRing(d, 'UA').pop(); writeDocs(d); return { ok: true } })
    expect(result.status).toBe('fallback')
    expect(result.reasons.join('\n')).toContain('is not closed')
    expectCommitted()
  })

  it('falls back on malformed JSON and on missing attributes', async () => {
    let result = await refresh(async () => { writeFileSync(path(CONFLICT_FILES[1]), '{"schemaVersion":1,'); return { ok: true } })
    expect(result.status).toBe('fallback')
    expectCommitted()
    result = await refresh(async () => { const d = refreshed(); delete d.lines.caveat; delete d.today.snapshots[0].coverage; writeDocs(d); return { ok: true } })
    expect(result.status).toBe('fallback')
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining('missing caveat'), expect.stringContaining('coverage must be localized')]))
    expectCommitted()
  })

  it('falls back (does not crash or block) on an impossible refreshed date', async () => {
    const result = await refresh(async () => { const d = refreshed(); d.lines.asOf = '2026-13-01'; writeDocs(d); return { ok: true } })
    expect(result.status).toBe('fallback')
    expect(result.reasons.join('\n')).toContain('is not a calendar date')
    expectCommitted()
  })

  it('blocks cleanly when the committed snapshot has an impossible date', async () => {
    const docs = committed()
    docs.lines.asOf = '2026-13-01'
    writeDocs(docs)
    const result = await refresh(async () => ({ ok: true }))
    expect(result.status).toBe('blocked')
    expect(result.reasons.join('\n')).toContain('is not a calendar date')
  })

  it('falls back on data older than the committed snapshot', async () => {
    const result = await refresh(async () => { writeDocs(refreshed(OLD)); return { ok: true } })
    expect(result.status).toBe('fallback')
    expectCommitted()
  })

  it('blocks the deployment when the generator changes an unrelated published file', async () => {
    const result = await refresh(async () => { writeDocs(refreshed()); writeFileSync(path('public/data/countries.json'), '{}'); return { ok: true } })
    expect(result.status).toBe('blocked')
    expect(result.reasons[0]).toContain('public/data/countries.json')
    expectCommitted()
  })

  it('blocks the deployment when the generator adds a published file', async () => {
    const result = await refresh(async () => { writeFileSync(path('public/data/extra.json'), '{}'); return { ok: true } })
    expect(result.status).toBe('blocked')
    expect(result.reasons[0]).toContain('public/data/extra.json')
  })

  it('blocks without running the generator when the committed snapshot is invalid', async () => {
    const docs = committed()
    firstRing(docs, 'RU').pop()
    writeDocs(docs)
    let ran = false
    const result = await refresh(async () => { ran = true; return { ok: true } })
    expect(result.status).toBe('blocked')
    expect(result.reasons[0]).toContain('no safe fallback')
    expect(ran).toBe(false)
  })

  it('blocks when the committed snapshot is missing', async () => {
    rmSync(path(CONFLICT_FILES[1]))
    const result = await refresh(async () => ({ ok: true }))
    expect(result.status).toBe('blocked')
  })
})
