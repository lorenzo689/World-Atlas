// @vitest-environment node
// Regression tests for the provenance of the generated historical territory data: the verifier must
// reject shipped data that is older than any generator input, and must not count absent gitignored
// inputs as verified.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CSHAPES_PATH, CSHAPES_SHA256, OCCUPATION_INPUTS, OCCUPATION_PACKAGES, TERRITORIES_INPUTS, TERRITORIES_PACKAGES,
  checkProvenance, currentInputs, packageVersions, provenanceRecord, sha256,
} from '../provenance.mjs'

const INPUTS = [...new Set([...OCCUPATION_INPUTS, ...TERRITORIES_INPUTS])]
const PACKAGES = [...new Set([...OCCUPATION_PACKAGES, ...TERRITORIES_PACKAGES])]
const SHIPPED = 'public/data/territories-history.json'

describe('shipped territories-history.json', () => {
  it('records every declared input of both generator stages at its current revision', () => {
    const data = JSON.parse(readFileSync(SHIPPED, 'utf8'))
    expect(Object.keys(data.provenance.inputs).sort()).toEqual([...INPUTS].sort())
    expect(checkProvenance(data.provenance, { inputs: INPUTS, packages: PACKAGES }).errors).toEqual([])
    // Gitignored downloads are recorded too, even though CI cannot recompute them.
    expect(data.provenance.external[CSHAPES_PATH]).toBe(CSHAPES_SHA256)
    expect(Object.keys(data.provenance.external).some((path) => /ohm-ww2-\d+\.json$/.test(path))).toBe(true)
  })
})

// The verifier, run as CI runs it, against a scratch copy of everything it reads.
describe('npm run data:ww2:verify on a scratch copy', () => {
  let root
  const verify = (...args) => spawnSync(process.execPath, ['scripts/verify-ww2-territories.mjs', ...args], { cwd: root, encoding: 'utf8' })
  const edit = (path, change) => writeFileSync(join(root, path), change(readFileSync(join(root, path), 'utf8')))
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ww2-provenance-'))
    for (const path of [...INPUTS, SHIPPED, 'package-lock.json', 'scripts/verify-ww2-territories.mjs', 'scripts/lib/provenance.mjs']) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      cpSync(path, join(root, path))
    }
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('passes on the unchanged inputs and reports absent gitignored inputs as unverified', () => {
    const result = verify()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toMatch(/NOT recomputed/)
    expect(result.stderr).toContain(CSHAPES_PATH)
  })

  it('fails with --require-external when gitignored inputs are absent', () => {
    const result = verify('--require-external')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`External input ${CSHAPES_PATH} is not present`)
  })

  it('detects a changed dated entry in ww2-sides.mjs', () => {
    edit('scripts/lib/ww2-sides.mjs', (text) => {
      const changed = text.replace("'1939-05-22', '1943-09-08', 'Italy (Pact of Steel)", "'1940-06-10', '1943-09-08', 'Italy (Pact of Steel)")
      expect(changed).not.toBe(text)
      return changed
    })
    const result = verify()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Input scripts/lib/ww2-sides.mjs changed since the data was generated')
  })

  it.each([
    ['scripts/build-ww2-occupation.mjs'],
    ['scripts/build-territories.mjs'],
    ['src/lib/ww2.ts'],
    ['src/lib/ww2-atlas-fronts.json'],
    ['scripts/data/ww2-atlas.json'],
    ['public/data/boundaries.json'],
  ])('detects a change to %s', (path) => {
    edit(path, (text) => `${text}\n`)
    const result = verify()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`Input ${path} changed`)
  })

  it('detects a changed binary input', () => {
    const path = join(root, 'scripts/data/ww2-annexations.geojson.gz')
    const bytes = readFileSync(path)
    bytes[bytes.length - 1] ^= 1
    writeFileSync(path, bytes)
    expect(verify().stderr).toContain('Input scripts/data/ww2-annexations.geojson.gz changed')
  })

  it('detects a geometry package upgrade in package-lock.json', () => {
    edit('package-lock.json', (text) => {
      const lock = JSON.parse(text)
      lock.packages['node_modules/polygon-clipping'].version = '99.0.0'
      return JSON.stringify(lock)
    })
    const result = verify()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Package polygon-clipping is 99.0.0')
  })

  it('ignores CRLF line endings (Windows checkout with core.autocrlf)', () => {
    edit('scripts/lib/ww2-sides.mjs', (text) => text.replace(/\r?\n/g, '\r\n'))
    expect(verify().status).toBe(0)
  })

  it('rejects shipped data without a provenance record', () => {
    edit(SHIPPED, (text) => {
      const data = JSON.parse(text)
      delete data.provenance
      return JSON.stringify(data)
    })
    expect(verify().stderr).toContain('No provenance record')
  })
})

describe('checkProvenance', () => {
  let root
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const lock = { packages: { 'node_modules/geo': { version: '1.0.0' } } }
  const record = (overrides = {}) => provenanceRecord({
    inputs: currentInputs(['a.mjs'], root),
    packages: packageVersions(['geo'], root),
    external: { [CSHAPES_PATH]: CSHAPES_SHA256, 'ohm.json': sha256('relation') },
    ...overrides,
  })
  const check = (value, options = {}) => checkProvenance(value, { inputs: ['a.mjs'], packages: ['geo'], root, ...options })
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'provenance-unit-'))
    write('a.mjs', 'export const x = 1\n')
    write('package-lock.json', JSON.stringify(lock))
    write('ohm.json', 'relation')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('is deterministic and independent of key order', () => {
    const a = provenanceRecord({ inputs: { b: '2', a: '1' }, packages: {}, external: {} })
    const b = provenanceRecord({ inputs: { a: '1', b: '2' }, packages: {}, external: {} })
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('accepts a current record; CShapes is reported unverified when absent', () => {
    expect(check(record())).toEqual({ errors: [], unverified: [CSHAPES_PATH] })
  })

  it('rejects a hand-edited record whose fingerprint no longer matches', () => {
    const value = record()
    value.packages.geo = '2.0.0'
    expect(check(value).errors).toContain('Provenance fingerprint does not match its recorded inputs (edited by hand?)')
  })

  it('rejects inputs missing from or no longer declared in the record', () => {
    expect(check(record(), { inputs: ['a.mjs', 'b.mjs'] }).errors).toContain('Input b.mjs is not in the recorded provenance')
    write('b.mjs', '')
    const extra = record({ inputs: currentInputs(['a.mjs', 'b.mjs'], root) })
    expect(check(extra).errors).toContain('Recorded input b.mjs is no longer a declared input')
  })

  it('rejects a changed external input that is present, and a CShapes hash other than the pin', () => {
    write('ohm.json', 'relation, edited upstream')
    expect(check(record()).errors).toContain('External input ohm.json differs from the revision the data was generated from')
    const unpinned = record({ external: { [CSHAPES_PATH]: sha256('other revision') } })
    expect(check(unpinned).errors.some((e) => e.startsWith('Recorded CShapes hash'))).toBe(true)
  })

  it('treats absent external inputs as errors in strict mode', () => {
    rmSync(join(root, 'ohm.json'))
    const { errors, unverified } = check(record(), { strictExternal: true })
    expect(unverified.sort()).toEqual(['ohm.json', CSHAPES_PATH].sort())
    expect(errors).toContain('External input ohm.json is not present, so it cannot be verified')
  })
})
