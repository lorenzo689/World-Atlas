// The routine data verification sequence (npm run verify:data), shared by local use and CI.
//
// DATA_CHECKS is the single authoritative list: .github/workflows/ci.yml runs `npm run verify:data`
// instead of listing the verifiers itself, and scripts/lib/__tests__/verify-data.test.mjs fails if
// CI stops doing so or a check is not an npm script.
//
// audit:map rewrites the tracked docs/MAP-AUDIT.md (and the gitignored perf-results/map-audit.json).
// CI fails when that rewrite changes the document. The runner restores the document's original bytes
// either way and reports a content change as a failure: the check matches CI without leaving the
// working tree modified, and uncommitted edits to the document survive. Content is compared with
// line endings normalised (the audit writes LF; a Windows checkout with core.autocrlf has CRLF),
// as `git diff` does in CI.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_CHECKS = ['data:history:verify', 'data:ww2:verify', 'data:detail:verify', 'data:conflicts:verify', 'audit:map']
export const AUDIT_CHECK = 'audit:map'
/** Relative to the frontend directory. */
export const AUDIT_DOC = '../docs/MAP-AUDIT.md'

/**
 * Runs an npm script and returns its exit status (a number; 1 when it died from a signal or could not
 * start). npm sets npm_execpath to its CLI script; running that with this Node avoids shell
 * differences between Windows (npm.cmd) and Linux. Otherwise (run directly, or npm_execpath points to
 * another tool such as npx, yarn or pnpm) the npm on PATH is used, through a shell only on Windows.
 */
export function npmRunner({ cwd = process.cwd(), env = process.env } = {}) {
  const cli = env.npm_execpath
  return (name) => {
    const result = cli && /npm-cli\.c?js$/.test(cli)
      ? spawnSync(process.execPath, [cli, 'run', name], { cwd, env, stdio: 'inherit' })
      : spawnSync('npm', ['run', name], { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
    if (result.error) console.error(`could not start npm run ${name}: ${result.error.message}`)
    return typeof result.status === 'number' ? result.status : 1
  }
}

const text = (bytes) => (bytes === null ? null : bytes.toString('utf8').replace(/\r\n/g, '\n'))
const read = (path) => (existsSync(path) ? readFileSync(path) : null)

/** Runs the audit and puts the document back exactly as it was. */
function auditMap(run, auditPath) {
  const before = read(auditPath)
  const status = run(AUDIT_CHECK)
  const after = read(auditPath)
  const changed = text(before) !== text(after)
  if (before === null) { if (after !== null) rmSync(auditPath) } else if (!(after && before.equals(after))) writeFileSync(auditPath, before)
  if (status !== 0) return { status, detail: `exit ${status}` }
  if (changed) return { status: 1, detail: 'docs/MAP-AUDIT.md is stale (left unchanged): run npm run audit:map and commit it' }
  return { status: 0 }
}

/**
 * Runs the checks in order and stops at the first failure.
 * @param {{ cwd?: string, checks?: string[], run?: (name: string) => number, log?: Pick<Console, 'log' | 'error'> }} [options]
 * @returns {{ status: number, passed: string[], failed?: string, notRun: string[], detail?: string }}
 *   status is 0, or the failing check's non-zero exit status (1 for a stale audit document).
 */
export function verifyData({ cwd = process.cwd(), checks = DATA_CHECKS, run = npmRunner({ cwd }), log = console } = {}) {
  const passed = []
  for (const [i, name] of checks.entries()) {
    log.log(`\n▶ ${name}`)
    const outcome = name === AUDIT_CHECK ? auditMap(run, join(cwd, AUDIT_DOC)) : (() => {
      const status = run(name)
      return status === 0 ? { status } : { status, detail: `exit ${status}` }
    })()
    if (outcome.status !== 0) {
      const notRun = checks.slice(i + 1)
      log.error(`\n✖ verify:data failed at ${name}: ${outcome.detail}`)
      if (passed.length) log.error(`  passed before it: ${passed.join(', ')}`)
      log.error(`  not run: ${notRun.join(', ') || '-'}`)
      return { status: outcome.status, passed, failed: name, notRun, detail: outcome.detail }
    }
    passed.push(name)
  }
  log.log(`\n✔ verify:data passed: ${passed.join(', ')}`)
  return { status: 0, passed, notRun: [] }
}
