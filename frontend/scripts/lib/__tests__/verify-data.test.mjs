// @vitest-environment node
// Regression tests for npm run verify:data (scripts/verify-data.mjs, scripts/lib/verify-data.mjs).
// Every case works in a temporary directory; the real working tree is only read.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUDIT_CHECK, DATA_CHECKS, verifyData } from '../verify-data.mjs'

const GENERATED = '# Map audit\n\n| metric | value |\n| --- | --- |\n| maxDisplacementKm | 2.99 |\n'
const CLI = resolve('scripts/verify-data.mjs')
const quiet = { log: () => {}, error: () => {} }

let root, frontend, auditDoc
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'verify-data-'))
  frontend = join(root, 'frontend')
  mkdirSync(frontend)
  mkdirSync(join(root, 'docs'))
  auditDoc = join(root, 'docs', 'MAP-AUDIT.md')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A fake npm runner: records calls, returns the configured status, lets audit:map write the doc. */
function fakeRun({ status = {}, audit = GENERATED } = {}) {
  const calls = []
  const run = (name) => {
    calls.push(name)
    if (name === AUDIT_CHECK && audit !== null) writeFileSync(auditDoc, audit)
    return status[name] ?? 0
  }
  return { calls, run }
}
const verify = (fake) => verifyData({ cwd: frontend, run: fake.run, log: quiet })

describe('verifyData sequence', () => {
  it('runs every check in order and succeeds when all pass and the audit document is current', () => {
    writeFileSync(auditDoc, GENERATED)
    const fake = fakeRun()
    const result = verify(fake)
    expect(result).toMatchObject({ status: 0, passed: DATA_CHECKS, notRun: [] })
    expect(fake.calls).toEqual(DATA_CHECKS)
  })

  it('stops at the first failing verifier and returns its exit status', () => {
    writeFileSync(auditDoc, GENERATED)
    const fake = fakeRun({ status: { 'data:ww2:verify': 3 } })
    const result = verify(fake)
    expect(result).toMatchObject({ status: 3, failed: 'data:ww2:verify', passed: ['data:history:verify'] })
    expect(result.notRun).toEqual(['data:detail:verify', 'data:conflicts:verify', 'audit:map'])
    expect(fake.calls).toEqual(['data:history:verify', 'data:ww2:verify'])
  })

  it('fails on a stale MAP-AUDIT.md and restores its exact bytes', () => {
    const old = GENERATED.replace('2.99', '3.50')
    writeFileSync(auditDoc, old)
    const result = verify(fakeRun())
    expect(result).toMatchObject({ status: 1, failed: AUDIT_CHECK })
    expect(result.detail).toContain('MAP-AUDIT.md is stale')
    expect(readFileSync(auditDoc, 'utf8')).toBe(old)
  })

  it('propagates an audit regression (non-zero exit) and still restores the document', () => {
    const before = `${GENERATED}user note\n`
    writeFileSync(auditDoc, before)
    const result = verify(fakeRun({ status: { [AUDIT_CHECK]: 2 } }))
    expect(result).toMatchObject({ status: 2, failed: AUDIT_CHECK })
    expect(readFileSync(auditDoc, 'utf8')).toBe(before)
  })

  it('treats a CRLF checkout of current content as current and keeps the CRLF bytes', () => {
    const crlf = Buffer.from(GENERATED.replace(/\n/g, '\r\n'))
    writeFileSync(auditDoc, crlf)
    const result = verify(fakeRun())
    expect(result.status).toBe(0)
    expect(readFileSync(auditDoc).equals(crlf)).toBe(true)
  })

  it('still detects a real change in a CRLF checkout', () => {
    const crlf = Buffer.from(GENERATED.replace('2.99', '3.50').replace(/\n/g, '\r\n'))
    writeFileSync(auditDoc, crlf)
    expect(verify(fakeRun()).status).toBe(1)
    expect(readFileSync(auditDoc).equals(crlf)).toBe(true)
  })

  it('never destroys uncommitted user edits to the audit document or other files', () => {
    const edited = `${GENERATED}\nDraft paragraph the user has not committed yet.\n`
    writeFileSync(auditDoc, edited)
    const other = join(root, 'docs', 'NOTES.md')
    writeFileSync(other, 'unrelated user file\n')
    verify(fakeRun())
    expect(readFileSync(auditDoc, 'utf8')).toBe(edited)
    expect(readFileSync(other, 'utf8')).toBe('unrelated user file\n')
  })

  it('removes an audit document that did not exist before and reports it', () => {
    const result = verify(fakeRun())
    expect(result.status).toBe(1)
    expect(existsSync(auditDoc)).toBe(false)
  })

  it('restores a document the audit deleted', () => {
    writeFileSync(auditDoc, GENERATED)
    const fake = fakeRun({ audit: null })
    const run = (name) => { const s = fake.run(name); if (name === AUDIT_CHECK) rmSync(auditDoc); return s }
    expect(verifyData({ cwd: frontend, run, log: quiet }).status).toBe(1)
    expect(readFileSync(auditDoc, 'utf8')).toBe(GENERATED)
  })
})

describe('verify:data command (real npm, real process exit code)', () => {
  // A miniature frontend whose npm scripts record their call and exit as configured.
  function fixture(behaviour) {
    writeFileSync(join(frontend, 'step.mjs'), [
      "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'",
      'const name = process.argv[2]',
      "const b = JSON.parse(readFileSync('behaviour.json', 'utf8'))",
      "appendFileSync('calls.log', name + '\\n')",
      "if (name === 'audit:map') writeFileSync('../docs/MAP-AUDIT.md', b.audit)",
      'process.exit(b.status[name] ?? 0)',
    ].join('\n'))
    const scripts = Object.fromEntries(DATA_CHECKS.map((name) => [name, `node step.mjs ${name}`]))
    writeFileSync(join(frontend, 'package.json'), JSON.stringify({ name: 'fixture', private: true, scripts }))
    writeFileSync(join(frontend, 'behaviour.json'), JSON.stringify({ audit: GENERATED, status: {}, ...behaviour }))
  }
  const calls = () => readFileSync(join(frontend, 'calls.log'), 'utf8').trim().split('\n')
  const npmCli = /npm-cli\.c?js$/.test(process.env.npm_execpath ?? '') ? process.env.npm_execpath : null
  const cli = (env = {}) => {
    const base = { ...process.env }
    delete base.npm_execpath
    return spawnSync(process.execPath, [CLI], { cwd: frontend, env: { ...base, ...env }, encoding: 'utf8' })
  }

  it('exits 0 when every check passes (npm from PATH)', () => {
    fixture({})
    writeFileSync(auditDoc, GENERATED)
    const result = cli()
    expect(result.status, result.stderr).toBe(0)
    expect(calls()).toEqual(DATA_CHECKS)
  }, 60_000)

  it('exits with the failing check\'s status and runs nothing after it', () => {
    fixture({ status: { 'data:detail:verify': 7 } })
    writeFileSync(auditDoc, GENERATED)
    const result = cli()
    expect(result.status).toBe(7)
    expect(calls()).toEqual(['data:history:verify', 'data:ww2:verify', 'data:detail:verify'])
    expect(result.stderr).toContain('verify:data failed at data:detail:verify')
  }, 60_000)

  it('exits 1 on a stale CRLF audit document and leaves its bytes untouched', () => {
    fixture({})
    const stale = Buffer.from(GENERATED.replace('2.99', '9.99').replace(/\n/g, '\r\n'))
    writeFileSync(auditDoc, stale)
    const result = cli()
    expect(result.status).toBe(1)
    expect(readFileSync(auditDoc).equals(stale)).toBe(true)
  }, 60_000)

  it.skipIf(!npmCli)('uses npm_execpath when npm provides it', () => {
    fixture({ status: { 'data:conflicts:verify': 4 } })
    writeFileSync(auditDoc, GENERATED)
    const result = cli({ npm_execpath: npmCli })
    expect(result.status).toBe(4)
    expect(calls()).toEqual(DATA_CHECKS.slice(0, 4))
  }, 60_000)
})

describe('one authoritative sequence', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const ci = readFileSync('../.github/workflows/ci.yml', 'utf8')

  it('every check is an npm script, and every data verifier script is in the sequence', () => {
    for (const name of DATA_CHECKS) expect(pkg.scripts[name], name).toBeTypeOf('string')
    const verifiers = Object.keys(pkg.scripts).filter((name) => /^data:.*:verify$/.test(name))
    expect(DATA_CHECKS).toEqual(expect.arrayContaining(verifiers))
    expect(pkg.scripts['verify:data']).toBe('node scripts/verify-data.mjs')
    expect(pkg.scripts['verify:fast'].startsWith('npm run verify:data && ')).toBe(true)
  })

  it('CI runs the same sequence instead of its own list', () => {
    expect(ci).toMatch(/^\s+run: npm run verify:data$/m)
    for (const name of DATA_CHECKS) expect(ci, `${name} listed separately in ci.yml`).not.toMatch(new RegExp(`npm run ${name}\\b`))
  })
})
